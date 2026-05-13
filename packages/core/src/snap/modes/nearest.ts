// Nearest snap — closest point on the entity to the cursor. The
// weakest of the hard snaps; only fires when no stronger mode matches.
//
// TODO: integrate when geometry/primitives.ts lands. Until then we
// implement line / polyline-segment / circle / arc closest-point with
// local Vec2 math.
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance, sub, dot, normalize, length, scale, add } from "../../geometry/Vec2.js";
import type { Entity, PolylineVertex } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function nearest(cursor: Vec2, entity: Entity): SnapCandidate | null {
  let p: Vec2 | null = null;
  switch (entity.kind) {
    case "line":
      p = closestOnSegment(cursor, entity.a, entity.b);
      break;
    case "polyline":
      p = closestOnPolyline(cursor, entity.vertices, entity.closed);
      break;
    case "circle":
      p = closestOnCircle(cursor, entity.c, entity.r);
      break;
    case "arc":
      p = closestOnArc(cursor, entity.c, entity.r, entity.startAngle, entity.endAngle);
      break;
    default:
      return null;
  }
  if (p === null) return null;
  return {
    point: p,
    mode: "nearest",
    strength: "hard",
    source: { entityId: entity.id, ref: { kind: "computed" } },
    distancePx: distance(cursor, p),
    rank: 0,
  };
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return a;
  let t = dot(sub(p, a), ab) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return [a[0] + ab[0] * t, a[1] + ab[1] * t];
}

function closestOnPolyline(
  p: Vec2,
  verts: readonly PolylineVertex[],
  closed: boolean,
): Vec2 | null {
  if (verts.length < 2) return null;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  const consider = (q: Vec2): void => {
    const d = distance(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  };
  for (let i = 0; i < verts.length - 1; i++) {
    consider(closestOnSegment(p, verts[i]!.p, verts[i + 1]!.p));
  }
  if (closed) {
    consider(closestOnSegment(p, verts[verts.length - 1]!.p, verts[0]!.p));
  }
  return best;
}

function closestOnCircle(p: Vec2, c: Vec2, r: number): Vec2 {
  const d = sub(p, c);
  const l = length(d);
  if (l === 0) return [c[0] + r, c[1]];
  return add(c, scale(normalize(d), r));
}

function closestOnArc(
  p: Vec2,
  c: Vec2,
  r: number,
  startAngle: number,
  endAngle: number,
): Vec2 {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  let angle = Math.atan2(dy, dx);
  // Normalize angles to [start, start + 2π) then clamp to [start, end].
  const twoPi = Math.PI * 2;
  const norm = (a: number): number => {
    let x = a - startAngle;
    x = ((x % twoPi) + twoPi) % twoPi;
    return startAngle + x;
  };
  angle = norm(angle);
  const sweepEnd = norm(endAngle);
  if (angle > sweepEnd) {
    // Outside sweep — clamp to the nearer endpoint.
    const distToStart = circDist(angle, startAngle);
    const distToEnd = circDist(angle, sweepEnd);
    angle = distToStart < distToEnd ? startAngle : endAngle;
  }
  return [c[0] + r * Math.cos(angle), c[1] + r * Math.sin(angle)];
}

function circDist(a: number, b: number): number {
  const twoPi = Math.PI * 2;
  const d = Math.abs(((a - b) % twoPi + twoPi) % twoPi);
  return Math.min(d, twoPi - d);
}
