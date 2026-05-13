// Tangent snap — point on a circle / arc where a line from the cursor
// would be tangent to the curve. For a cursor at distance d from the
// center and radius r, the tangent foot lies at angle
// atan2(dy,dx) ± acos(r/d). We pick whichever foot is closer to the
// cursor.
//
// TODO: integrate when geometry/primitives.ts lands.
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance } from "../../geometry/Vec2.js";
import type { Entity } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function tangent(cursor: Vec2, entity: Entity): SnapCandidate | null {
  if (entity.kind !== "circle" && entity.kind !== "arc") return null;
  const dx = cursor[0] - entity.c[0];
  const dy = cursor[1] - entity.c[1];
  const d = Math.hypot(dx, dy);
  if (d <= entity.r) return null; // No real tangent from inside the circle.
  const base = Math.atan2(dy, dx);
  const off = Math.acos(entity.r / d);
  const a1 = base + off;
  const a2 = base - off;
  const candidates: Vec2[] = [
    [entity.c[0] + entity.r * Math.cos(a1), entity.c[1] + entity.r * Math.sin(a1)],
    [entity.c[0] + entity.r * Math.cos(a2), entity.c[1] + entity.r * Math.sin(a2)],
  ];
  let best: Vec2 = candidates[0]!;
  let bestD = distance(cursor, candidates[0]!);
  for (let i = 1; i < candidates.length; i++) {
    const cd = distance(cursor, candidates[i]!);
    if (cd < bestD) {
      bestD = cd;
      best = candidates[i]!;
    }
  }
  // For an arc, restrict tangent foot to the arc's angular sweep.
  if (entity.kind === "arc") {
    const ang = Math.atan2(best[1] - entity.c[1], best[0] - entity.c[0]);
    if (!withinSweep(ang, entity.startAngle, entity.endAngle)) return null;
  }
  return {
    point: best,
    mode: "tangent",
    strength: "hard",
    source: { entityId: entity.id, ref: { kind: "computed" } },
    distancePx: bestD,
    rank: 0,
  };
}

function withinSweep(a: number, start: number, end: number): boolean {
  const twoPi = Math.PI * 2;
  const norm = (x: number): number => ((x % twoPi) + twoPi) % twoPi;
  const aN = norm(a - start);
  const eN = norm(end - start);
  return aN <= eN + 1e-9;
}
