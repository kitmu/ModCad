// Perpendicular snap — foot of the perpendicular from the cursor onto
// the entity. For a line/segment the snap point is the projection
// (clamped to the segment); the foot is suppressed if it falls outside
// the segment (caller may still get a "nearest" candidate instead).
//
// TODO: integrate when geometry/primitives.ts lands. Until then we
// implement the line case locally — perpendicular on circles/arcs is
// the closest point on the curve, which the `nearest` evaluator already
// covers.
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance, sub, dot } from "../../geometry/Vec2.js";
import type { Entity } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function perpendicular(cursor: Vec2, entity: Entity): SnapCandidate | null {
  if (entity.kind === "line") {
    const foot = footOnInfiniteLine(cursor, entity.a, entity.b);
    if (foot === null) return null;
    // Only emit when the foot lies within the segment — otherwise the
    // perpendicular doesn't exist for this segment.
    const ab = sub(entity.b, entity.a);
    const t = dot(sub(foot, entity.a), ab) / dot(ab, ab);
    if (t < 0 || t > 1) return null;
    return {
      point: foot,
      mode: "perpendicular",
      strength: "hard",
      source: { entityId: entity.id, ref: { kind: "computed" } },
      distancePx: distance(cursor, foot),
      rank: 0,
    };
  }
  // Polyline perpendicular: check each segment.
  if (entity.kind === "polyline") {
    const verts = entity.vertices;
    let best: Vec2 | null = null;
    let bestD = Infinity;
    const considerSegment = (a: Vec2, b: Vec2): void => {
      const foot = footOnInfiniteLine(cursor, a, b);
      if (foot === null) return;
      const ab = sub(b, a);
      const t = dot(sub(foot, a), ab) / dot(ab, ab);
      if (t < 0 || t > 1) return;
      const d = distance(cursor, foot);
      if (d < bestD) {
        bestD = d;
        best = foot;
      }
    };
    for (let i = 0; i < verts.length - 1; i++) {
      considerSegment(verts[i]!.p, verts[i + 1]!.p);
    }
    if (entity.closed && verts.length > 1) {
      considerSegment(verts[verts.length - 1]!.p, verts[0]!.p);
    }
    if (best === null) return null;
    return {
      point: best,
      mode: "perpendicular",
      strength: "hard",
      source: { entityId: entity.id, ref: { kind: "computed" } },
      distancePx: bestD,
      rank: 0,
    };
  }
  return null;
}

function footOnInfiniteLine(p: Vec2, a: Vec2, b: Vec2): Vec2 | null {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return null;
  const t = dot(sub(p, a), ab) / len2;
  return [a[0] + ab[0] * t, a[1] + ab[1] * t];
}
