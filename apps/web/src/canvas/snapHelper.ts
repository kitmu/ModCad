// T080 — SnapEngine integration for the canvas layer.
//
// Replaces the US1-minimal endpoint-only shim with a thin wrapper
// around `@modcad/core`'s SnapEngine. The engine itself is stateful
// (Tab cycling, motion history) and lives behind a per-canvas
// SnapController instance. Tools and overlays go through this layer.
//
// The legacy `snapEndpoint(cursor, drawing, zoom)` function is kept
// (with its original signature) so US1's LineTool / RectangleTool /
// MoveTool keep working. It now delegates to a one-shot SnapEngine
// query restricted to the endpoint mode.
import {
  SnapEngine,
  buildStaticIndex,
  bboxOfEntity,
  listVisibleEntities,
  type Drawing,
  type Entity,
  type SnapCandidate,
  type SnapMode,
  type SpatialIndex,
  type Vec2Type,
} from "@modcad/core";

export interface SnapHit {
  /** Snapped world coordinate (use this instead of the raw cursor). */
  point: Vec2Type;
  /** Distance from the raw cursor to the snap point, in screen pixels. */
  distancePx: number;
  /** Snap mode that produced this candidate. */
  mode: SnapMode;
  /** Hard vs soft per FR-008b. */
  strength: "hard" | "soft";
}

/** Default screen-pixel radius at which a snap engages. */
export const SNAP_RADIUS_PX = 12;

const ENDPOINT_ONLY: ReadonlySet<SnapMode> = new Set<SnapMode>(["endpoint"]);
const EMPTY_SOFT: ReadonlySet<SnapMode> = new Set<SnapMode>();

/** Build a fresh static spatial index over the drawing's visible entities. */
function buildIndex(drawing: Drawing): {
  index: SpatialIndex;
  entitiesById: Map<string, Entity>;
} {
  const ents = listVisibleEntities(drawing);
  const entries: Array<{ id: typeof ents[number]["id"]; bbox: ReturnType<typeof bboxOfEntity> }> = [];
  const entitiesById = new Map<string, Entity>();
  for (const e of ents) {
    if (e.kind === "dimension") continue; // dims aren't snap targets
    entries.push({ id: e.id, bbox: bboxOfEntity(e) });
    entitiesById.set(e.id, e);
  }
  return { index: buildStaticIndex(entries), entitiesById };
}

/**
 * One-shot snap query used by the US1 tools. Preserves the original
 * signature: caller passes `zoom=1` for world-space radius semantics.
 */
export function snapEndpoint(
  cursor: Vec2Type,
  drawing: Drawing | null,
  zoom: number,
): SnapHit | null {
  if (!drawing) return null;
  const { index, entitiesById } = buildIndex(drawing);
  const engine = new SnapEngine(
    (box) => index.queryBox(box).map((id) => entitiesById.get(id)!).filter(Boolean),
    {
      radiusPx: SNAP_RADIUS_PX,
      softModes: EMPTY_SOFT,
    },
  );
  const screenToWorldScale = 1 / Math.max(zoom, 1e-9);
  const c = engine.query(cursor, ENDPOINT_ONLY, screenToWorldScale);
  return c === null ? null : candidateToHit(c);
}

function candidateToHit(c: SnapCandidate): SnapHit {
  return {
    point: [c.point[0], c.point[1]],
    distancePx: c.distancePx,
    mode: c.mode,
    strength: c.strength,
  };
}

/**
 * Stateful per-canvas snap controller. Owns the SnapEngine instance,
 * tracks the recent motion vector (last few samples for predictive
 * ranking, FR-008), and handles Tab cycling through alternates
 * (FR-008a).
 *
 * Tools call `query(cursor, drawing, screenToWorldScale)` on every
 * pointer-move; the SnapOverlay reads `state` to render the marker
 * and inline measurement.
 */
export class SnapController {
  private engine: SnapEngine | null = null;
  private lastDrawing: Drawing | null = null;
  private readonly motionSamples: Vec2Type[] = [];
  private currentCandidate: SnapCandidate | null = null;
  private cursorWorld: Vec2Type = [0, 0];
  private lastCommittedPoint: Vec2Type | null = null;
  private enabledModes: ReadonlySet<SnapMode> = ENDPOINT_ONLY;
  private softModes: ReadonlySet<SnapMode> = EMPTY_SOFT;

  setEnabled(modes: ReadonlySet<SnapMode>): void {
    this.enabledModes = modes;
  }

  setLastCommittedPoint(p: Vec2Type | null): void {
    this.lastCommittedPoint = p;
  }

  getLastCommittedPoint(): Vec2Type | null {
    return this.lastCommittedPoint;
  }

  current(): SnapCandidate | null {
    return this.currentCandidate;
  }

  cursor(): Vec2Type {
    return this.cursorWorld;
  }

  /**
   * Cycle to the next alternate from the most recent query (Tab key,
   * per FR-008a). Returns null if no cycle is in flight.
   */
  next(): SnapCandidate | null {
    if (!this.engine) return null;
    const c = this.engine.next();
    if (c !== null) this.currentCandidate = c;
    return c;
  }

  query(
    cursor: Vec2Type,
    drawing: Drawing | null,
    screenToWorldScale: number,
  ): SnapCandidate | null {
    this.cursorWorld = [cursor[0], cursor[1]];
    if (!drawing) {
      this.currentCandidate = null;
      return null;
    }
    if (drawing !== this.lastDrawing || this.engine === null) {
      const { index, entitiesById } = buildIndex(drawing);
      this.engine = new SnapEngine(
        (box) => index.queryBox(box).map((id) => entitiesById.get(id)!).filter(Boolean),
        {
          radiusPx: SNAP_RADIUS_PX,
          softModes: this.softModes,
          gridSpacing: drawing.settings.grid.size,
        },
      );
      this.lastDrawing = drawing;
    }
    // Push the latest motion sample (last 3 retained).
    if (this.motionSamples.length >= 3) this.motionSamples.shift();
    this.motionSamples.push(cursor);
    const motion = this.motionVector();
    const result = this.engine.query(cursor, this.enabledModes, screenToWorldScale, motion);
    this.currentCandidate = result;
    return result;
  }

  private motionVector(): Vec2Type | undefined {
    if (this.motionSamples.length < 2) return undefined;
    const first = this.motionSamples[0]!;
    const last = this.motionSamples[this.motionSamples.length - 1]!;
    return [last[0] - first[0], last[1] - first[1]];
  }
}
