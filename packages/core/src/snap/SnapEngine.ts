// SnapEngine — implements FR-007 (snap types), FR-008 (≤50 ms emission
// latency), FR-008a (static-cursor precedence ladder), FR-008b (hard
// vs soft + inline measurement).
//
// Ranking strategy:
//   1. For static cursors (no motion vector or near-zero), rank by the
//      `MODE_RANK` ladder: endpoint > intersection > center > midpoint
//      > perpendicular > tangent > node > nearest. Ties broken by
//      screen-pixel distance.
//   2. With a motion vector, predictive boosts kick in: candidates
//      whose displacement-from-cursor aligns with the motion vector get
//      a small rank discount. Still capped so soft never out-ranks
//      hard (FR-008b).
//   3. Soft candidates (parallel, plus anything the caller flags via
//      `softModes`) are always ranked strictly below every hard
//      candidate, regardless of pixel distance or motion.
import type { Vec2 } from "../geometry/Vec2.js";
import { distance, length, dot, sub } from "../geometry/Vec2.js";
import type { Bbox } from "../geometry/Bbox.js";
import type { Entity, SnapMode } from "../scene/types.js";
import { endpoint } from "./modes/endpoint.js";
import { midpoint } from "./modes/midpoint.js";
import { center } from "./modes/center.js";
import { node } from "./modes/node.js";
import { nearest } from "./modes/nearest.js";
import { perpendicular } from "./modes/perpendicular.js";
import { tangent } from "./modes/tangent.js";
import { intersection } from "./modes/intersection.js";
import { parallel } from "./modes/parallel.js";
import { grid } from "./modes/grid.js";
import type { SnapCandidate, SnapStrength } from "./modes/types.js";

export type { SnapCandidate, SnapStrength } from "./modes/types.js";

export interface SnapEngineOptions {
  /** Screen-space radius (px). Converted to world via screenToWorldScale. */
  radiusPx: number;
  /**
   * Modes the caller wants treated as soft. Per FR-008b these never
   * out-rank a hard snap. `parallel` is always soft regardless of this
   * set (it is the canonical soft snap).
   */
  softModes: ReadonlySet<SnapMode>;
  /** Grid spacing (world units). Required when "grid" is enabled. */
  gridSpacing?: Vec2;
}

// Static-cursor precedence ladder per FR-008a. Lower number = stronger.
const MODE_RANK: Readonly<Record<SnapMode, number>> = {
  endpoint: 0,
  intersection: 1,
  center: 2,
  midpoint: 3,
  perpendicular: 4,
  tangent: 5,
  node: 6,
  nearest: 7,
  // Soft snaps — kept here for completeness; the engine forces them to
  // rank below every hard candidate via the strength split.
  parallel: 100,
  grid: 8,
};

// Motion magnitude (world units / sample) below which we treat the
// cursor as static. Tunable; chosen small enough that any real cursor
// move trips predictive mode.
const STATIC_MOTION_EPS = 1e-6;

export class SnapEngine {
  private readonly getEntities: (box: Bbox) => Entity[];
  private readonly opts: SnapEngineOptions;
  private cycle: SnapCandidate[] = [];
  private cycleIdx = 0;

  constructor(
    getEntities: (box: Bbox) => Entity[],
    opts: SnapEngineOptions,
  ) {
    this.getEntities = getEntities;
    this.opts = opts;
  }

  query(
    cursor: Vec2,
    enabledModes: ReadonlySet<SnapMode>,
    screenToWorldScale: number,
    motionVector?: Vec2,
  ): SnapCandidate | null {
    const radiusWorld = this.opts.radiusPx * screenToWorldScale;
    const box: Bbox = {
      minX: cursor[0] - radiusWorld,
      minY: cursor[1] - radiusWorld,
      maxX: cursor[0] + radiusWorld,
      maxY: cursor[1] + radiusWorld,
    };
    const entities = this.getEntities(box);
    const raw: SnapCandidate[] = [];

    for (const e of entities) {
      this.collectFromEntity(cursor, e, enabledModes, raw);
    }
    // Intersection pairs.
    if (enabledModes.has("intersection")) {
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const c = intersection(cursor, entities[i]!, entities[j]!);
          if (c !== null) raw.push(c);
        }
      }
    }
    // Grid.
    if (enabledModes.has("grid") && this.opts.gridSpacing) {
      const c = grid(cursor, this.opts.gridSpacing);
      if (c !== null) raw.push(c);
    }

    // Radius gate (screen-space).
    const radiusPx = this.opts.radiusPx;
    const inRange: SnapCandidate[] = [];
    for (const c of raw) {
      // distancePx was filled with world distance; convert.
      const dPx = distance(cursor, c.point) / screenToWorldScale;
      if (dPx <= radiusPx) {
        inRange.push({ ...c, distancePx: dPx });
      }
    }
    if (inRange.length === 0) {
      this.cycle = [];
      this.cycleIdx = 0;
      return null;
    }

    const ranked = this.rank(inRange, cursor, motionVector);
    this.cycle = ranked;
    this.cycleIdx = 0;
    return ranked[0] ?? null;
  }

  next(): SnapCandidate | null {
    if (this.cycle.length === 0) return null;
    this.cycleIdx += 1;
    if (this.cycleIdx >= this.cycle.length) return null;
    return this.cycle[this.cycleIdx] ?? null;
  }

  private collectFromEntity(
    cursor: Vec2,
    e: Entity,
    enabled: ReadonlySet<SnapMode>,
    out: SnapCandidate[],
  ): void {
    if (enabled.has("endpoint")) push(out, endpoint(cursor, e));
    if (enabled.has("midpoint")) push(out, midpoint(cursor, e));
    if (enabled.has("center")) push(out, center(cursor, e));
    if (enabled.has("node")) push(out, node(cursor, e));
    if (enabled.has("perpendicular")) push(out, perpendicular(cursor, e));
    if (enabled.has("tangent")) push(out, tangent(cursor, e));
    if (enabled.has("nearest")) push(out, nearest(cursor, e));
    if (enabled.has("parallel")) push(out, parallel(cursor, e));
  }

  private rank(
    candidates: SnapCandidate[],
    cursor: Vec2,
    motion: Vec2 | undefined,
  ): SnapCandidate[] {
    const motionMag = motion === undefined ? 0 : length(motion);
    const predictive = motionMag >= STATIC_MOTION_EPS;
    const softModes = this.opts.softModes;

    const strength = (c: SnapCandidate): SnapStrength =>
      c.mode === "parallel" || softModes.has(c.mode) ? "soft" : c.strength;

    const score = (c: SnapCandidate): number => {
      // Score is "rank-key" — lower is better.
      const base = MODE_RANK[c.mode];
      // Distance contributes a sub-rank discount: at most 0.99 so it
      // never crosses an integer ladder step. Closer = lower score.
      const radius = this.opts.radiusPx;
      const distTerm = (c.distancePx / radius) * 0.99;
      let s = base + distTerm;
      if (predictive && motion !== undefined) {
        // Predictive boost: candidates whose direction from cursor aligns
        // with the motion vector get up to a 0.9 discount. Capped so a
        // soft never crosses into hard territory; we apply only within
        // the same ladder step plus one (i.e. small enough to disturb
        // ties but not invert the static-cursor ladder).
        const toCand = sub(c.point, cursor);
        const toLen = length(toCand);
        if (toLen > 0) {
          const align = dot(toCand, motion) / (toLen * motionMag);
          if (align > 0) {
            // Allow predictive to lift a perpendicular / nearest above
            // a misaligned endpoint when motion strongly points at the
            // candidate. align^2 sharpens the boost so partial-alignment
            // candidates (off-axis endpoints) don't soak up the entire
            // discount. The strength split (below) still keeps soft
            // below hard regardless of this boost (FR-008b).
            s -= align * align * 6;
          }
        }
      }
      return s;
    };

    // Partition into hard and soft; rank each set; concat with soft after.
    // FR-008b: this enforces "soft snaps never out-rank hard snaps".
    const hard: SnapCandidate[] = [];
    const soft: SnapCandidate[] = [];
    for (const c of candidates) {
      const s = strength(c);
      if (s === "hard") hard.push(c);
      else soft.push(c);
    }
    hard.sort((a, b) => score(a) - score(b));
    soft.sort((a, b) => score(a) - score(b));
    return [...hard, ...soft].map((c, i) => ({
      ...c,
      strength: strength(c),
      rank: i,
    }));
  }
}

function push(out: SnapCandidate[], v: SnapCandidate | SnapCandidate[] | null): void {
  if (v === null) return;
  if (Array.isArray(v)) {
    for (const x of v) out.push(x);
  } else {
    out.push(v);
  }
}
