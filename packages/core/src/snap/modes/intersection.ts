// Intersection snap — needs pairs of entities, so it has a different
// signature from the single-entity evaluators. The engine collects the
// nearby entities from the spatial index and feeds the pairs in.
//
// TODO: integrate when geometry/intersections.ts lands. For now we
// handle line-line locally; line-arc / arc-arc fall back to the
// `nearest` evaluator at runtime (engine ranks them lower anyway).
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance } from "../../geometry/Vec2.js";
import type { Entity, LineEntity } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function intersection(
  cursor: Vec2,
  a: Entity,
  b: Entity,
): SnapCandidate | null {
  if (a.kind === "line" && b.kind === "line") {
    const p = intersectSegments(a, b);
    if (p === null) return null;
    return {
      point: p,
      mode: "intersection",
      strength: "hard",
      source: { entityId: a.id, ref: { kind: "computed" } },
      distancePx: distance(cursor, p),
      rank: 0,
    };
  }
  return null;
}

function intersectSegments(a: LineEntity, b: LineEntity): Vec2 | null {
  const x1 = a.a[0],
    y1 = a.a[1],
    x2 = a.b[0],
    y2 = a.b[1];
  const x3 = b.a[0],
    y3 = b.a[1],
    x4 = b.b[0],
    y4 = b.b[1];
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}
