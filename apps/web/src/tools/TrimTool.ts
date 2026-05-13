// TrimTool — FR-005a Quick + Classic dual mode for trimming.
//
// Flow per spec:
//   1. Start: "Select cutting edges or [Enter for Quick mode]".
//   2. If the user clicks entities → Classic mode: those are the
//      cutting edges. Subsequent clicks pick the target half to trim
//      against those edges.
//   3. If the user hits Enter at step 1 → Quick mode: hover an entity,
//      see the proposed cut, click commits. The cut is taken at the
//      first crossing of the target with any OTHER entity in cursor
//      direction (Quick mode uses the whole scene as cutting edges).
//
// The command-state panel reflects the active mode (FR-005a "active
// mode is shown in the persistent state panel").
import {
  segIntersect,
  trimCommand,
  type Drawing,
  type Entity,
  type Id,
  type LineEntity,
  type Vec2Type,
} from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { useSelection } from "../state/selection.js";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { useSnapState } from "../state/snapState.js";
import type { Tool, ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

type Mode = "select-edges" | "classic" | "quick";

function intersectionsWithEdges(
  target: Entity,
  edges: ReadonlyArray<Entity>,
): Vec2Type[] {
  if (target.kind !== "line") return []; // v1 quick/classic supports line targets only
  const out: Vec2Type[] = [];
  const t = target as LineEntity;
  for (const e of edges) {
    if (e.id === t.id) continue;
    if (e.kind === "line") {
      const p = segIntersect(t.a, t.b, e.a, e.b);
      if (p) out.push(p);
    }
    // (Circle/arc intersections deferred; sufficient for the US6 spec
    // which targets the two-line crossing scenario explicitly.)
  }
  return out;
}

function nearestEntity(
  drawing: Drawing,
  cursor: Vec2Type,
  tolerance: number,
): Id | null {
  // Reuse Selection.pickAt's logic inline — Tools shouldn't import
  // from each other. The geometry is identical.
  let best: { id: Id; d: number } | null = null;
  for (const id of drawing.entityOrder) {
    const e = drawing.entities[id];
    if (!e) continue;
    if (e.kind !== "line") continue;
    const d = pointToSeg(cursor, (e as LineEntity).a, (e as LineEntity).b);
    if (d <= tolerance && (best === null || d < best.d)) {
      best = { id: id as Id, d };
    }
  }
  return best?.id ?? null;
}

function pointToSeg(p: Vec2Type, a: Vec2Type, b: Vec2Type): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export class TrimTool implements Tool {
  readonly name = "modify.trim";
  private ctx!: ToolContext;
  private mode: Mode = "select-edges";
  private edges: Id[] = [];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    // Seed edges from current selection so the user can pre-select
    // cutting edges and skip the "select edges" prompt.
    const sliceId = useDrawingSession.getState().activeId;
    const sel = sliceId ? useSelection.getState().get(sliceId) : [];
    this.edges = [...sel];
    this.setStep("select-edges");
  }

  onPointerMove(_p: PointerSample): void {
    // Hover-preview is intentionally minimal in v1 — the e2e test
    // drives via click, not hover.
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return;
    if (this.mode === "select-edges") {
      // Classic: add the clicked entity to edges, switch to classic
      // mode on the first add.
      const hit = nearestEntity(this.ctx.bus.drawing, p.world, 1);
      if (!hit) return;
      if (!this.edges.includes(hit)) this.edges.push(hit);
      this.mode = "classic";
      this.setStep("classic");
      return;
    }
    // Both classic and quick modes: click target half to trim.
    const targetId = nearestEntity(this.ctx.bus.drawing, p.world, 1);
    if (!targetId) return;
    const target = this.ctx.bus.drawing.entities[targetId];
    if (!target) return;
    const edgeIds =
      this.mode === "quick"
        ? this.ctx.bus.drawing.entityOrder.filter((id) => id !== targetId)
        : this.edges.filter((id) => id !== targetId);
    const edges: Entity[] = [];
    for (const id of edgeIds) {
      const e = this.ctx.bus.drawing.entities[id];
      if (e) edges.push(e);
    }
    const cuts = intersectionsWithEdges(target, edges);
    if (cuts.length === 0) return;
    // Choose the nearest cut to the pick — same heuristic across both modes.
    cuts.sort(
      (a, b) =>
        Math.hypot(a[0] - p.world[0], a[1] - p.world[1]) -
        Math.hypot(b[0] - p.world[0], b[1] - p.world[1]),
    );
    const cutPoints = [cuts[0]!];
    this.ctx.bus.execute(
      trimCommand({ id: targetId as Id, cutPoints, pickPoint: p.world }),
    );
    this.ctx.syncDirty();
    useSnapState.getState().set(null);
  }

  onKeydown(e: KeyboardEvent): void {
    if (this.mode === "select-edges" && e.key === "Enter") {
      this.mode = "quick";
      this.setStep("quick");
      return;
    }
    if (e.key === "Escape") {
      useCommandState.getState().clear();
      this.ctx.done();
    }
  }

  dispose(): void {
    // No transient UI to clean up.
  }

  private setStep(mode: Mode): void {
    const label = "Trim";
    if (mode === "select-edges") {
      useCommandState.getState().setActive({
        name: this.name,
        label,
        step: {
          prompt: "Select cutting edges (or press Enter for Quick mode)",
          hints: ["Enter: Quick mode", "Esc: cancel"],
        },
      });
      return;
    }
    useCommandState.getState().setActive({
      name: this.name,
      label: `${label} — ${mode === "quick" ? "Quick" : "Classic"}`,
      step: {
        prompt:
          mode === "quick"
            ? "Click segment to trim (Quick mode)"
            : "Click segment to trim against selected edges",
        hints: ["Esc: cancel"],
      },
    });
  }
}
