// Parallel snap (soft) — the cursor lies on a line parallel to an
// existing line/segment that passes through some reference point. v1
// supports the AutoCAD-style "parallel extension" flavor: project the
// cursor onto the infinite line containing the reference entity's
// direction, anchored at the nearest endpoint. The candidate is soft
// (FR-008b) — it never out-ranks a hard snap.
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance, sub, dot, normalize } from "../../geometry/Vec2.js";
import type { Entity } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function parallel(cursor: Vec2, entity: Entity): SnapCandidate | null {
  if (entity.kind !== "line") return null;
  const dir = normalize(sub(entity.b, entity.a));
  if (dir[0] === 0 && dir[1] === 0) return null;
  // Anchor at the endpoint nearer to the cursor; project cursor onto
  // the infinite line through anchor with direction `dir`.
  const dA = distance(cursor, entity.a);
  const dB = distance(cursor, entity.b);
  const anchor: Vec2 = dA <= dB ? entity.a : entity.b;
  const v = sub(cursor, anchor);
  const t = dot(v, dir);
  const p: Vec2 = [anchor[0] + dir[0] * t, anchor[1] + dir[1] * t];
  return {
    point: p,
    mode: "parallel",
    strength: "soft",
    source: { entityId: entity.id, ref: { kind: "computed" } },
    distancePx: distance(cursor, p),
    rank: 0,
  };
}
