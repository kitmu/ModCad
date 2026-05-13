// Curve intersection helpers used by the snap engine, dimensions,
// and trim/extend commands. Sign decisions go through `orient2d` so
// degenerate inputs (collinear, touching, exactly tangent) don't
// swap branches due to roundoff.
import { orient2d } from "./predicates.js";
import type { Vec2 } from "./Vec2.js";
import type { ArcEntity } from "../scene/types.js";

const TAU = Math.PI * 2;

/**
 * Intersection of two segments [a1, a2] and [b1, b2]. Returns the
 * intersection point when the segments properly cross or touch at
 * an interior point or endpoint. Returns `null` when they are
 * disjoint or only collinear (a single point of overlap from a
 * collinear pair is not reported — callers that need overlap-aware
 * handling should detect it themselves).
 *
 * The sign of `orient2d` decides which side of each segment the
 * other endpoint lies on; if signs straddle (or include zero) on
 * both segments, they intersect.
 */
export function segIntersect(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
): Vec2 | null {
  const o1 = orient2d(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1]);
  const o2 = orient2d(a1[0], a1[1], a2[0], a2[1], b2[0], b2[1]);
  const o3 = orient2d(b1[0], b1[1], b2[0], b2[1], a1[0], a1[1]);
  const o4 = orient2d(b1[0], b1[1], b2[0], b2[1], a2[0], a2[1]);

  // Proper crossing — signs straddle on both segments.
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    // Compute intersection by line algebra.
    const dxA = a2[0] - a1[0];
    const dyA = a2[1] - a1[1];
    const dxB = b2[0] - b1[0];
    const dyB = b2[1] - b1[1];
    const denom = dxA * dyB - dyA * dxB;
    // denom == 0 is excluded by the straddle test above.
    const t = ((b1[0] - a1[0]) * dyB - (b1[1] - a1[1]) * dxB) / denom;
    return [a1[0] + t * dxA, a1[1] + t * dyA];
  }

  // Fully collinear (all four orient2d signs are zero): per the
  // docstring, overlap is not reported. Callers needing overlap-aware
  // behaviour must detect collinearity themselves.
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) return null;

  // Degenerate cases: one endpoint lies exactly on the other segment.
  if (o1 === 0 && onSegment(a1, a2, b1)) return [b1[0], b1[1]];
  if (o2 === 0 && onSegment(a1, a2, b2)) return [b2[0], b2[1]];
  if (o3 === 0 && onSegment(b1, b2, a1)) return [a1[0], a1[1]];
  if (o4 === 0 && onSegment(b1, b2, a2)) return [a2[0], a2[1]];

  return null;
}

/** True when collinear point p lies on the closed segment [a, b]. */
function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  );
}

/**
 * True when `p` lies on the segment [a, b] within `tolerance`.
 * Computed via perpendicular distance × segment-length so the test
 * works for zero-length segments too (where it degenerates to a
 * point-distance check).
 */
export function pointOnSeg(p: Vec2, a: Vec2, b: Vec2, tolerance: number): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Degenerate segment — compare to the single point.
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return Math.hypot(ex, ey) <= tolerance;
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  if (t < 0 || t > 1) return false;
  const projX = a[0] + t * dx;
  const projY = a[1] + t * dy;
  return Math.hypot(p[0] - projX, p[1] - projY) <= tolerance;
}

/**
 * Intersections of two circles. Returns 0, 1, or 2 points. The two-
 * point case is ordered such that the second point lies CCW of the
 * first when viewed from c1, which keeps boolean assemblers happy.
 */
export function circleIntersect(c1: Vec2, r1: number, c2: Vec2, r2: number): Vec2[] {
  const dx = c2[0] - c1[0];
  const dy = c2[1] - c1[1];
  const d = Math.hypot(dx, dy);
  // Coincident circles or strictly separated.
  if (d === 0) return [];
  if (d > r1 + r2) return [];
  if (d < Math.abs(r1 - r2)) return [];

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  // Numerical: hSq can be slightly negative at tangency.
  const h = hSq > 0 ? Math.sqrt(hSq) : 0;
  const px = c1[0] + (a * dx) / d;
  const py = c1[1] + (a * dy) / d;
  if (h === 0) {
    return [[px, py]];
  }
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  return [
    [px + rx, py + ry],
    [px - rx, py - ry],
  ];
}

/**
 * Normalized parameter (0..1) of `point` along an arc's CCW sweep
 * from startAngle to endAngle. Returns `null` when `point` does not
 * lie on the arc (off the supporting circle, or in the gap).
 *
 * Used by trim/extend to decide whether a candidate cut point is on
 * the kept portion of an arc entity.
 */
export function arcParam(arc: ArcEntity, point: Vec2): number | null {
  const dx = point[0] - arc.c[0];
  const dy = point[1] - arc.c[1];
  const r = Math.hypot(dx, dy);
  // Off the supporting circle.
  if (Math.abs(r - Math.abs(arc.r)) > 1e-9 * Math.max(1, Math.abs(arc.r))) {
    return null;
  }
  const theta = Math.atan2(dy, dx);
  const s = normalizeAngle(arc.startAngle);
  const e = normalizeAngle(arc.endAngle);
  const t = normalizeAngle(theta);

  const sweep = s <= e ? e - s : TAU - s + e;
  if (sweep === 0) return null;

  let param: number;
  if (s <= e) {
    if (t < s || t > e) return null;
    param = (t - s) / sweep;
  } else {
    if (t < s && t > e) return null;
    const local = t >= s ? t - s : TAU - s + t;
    param = local / sweep;
  }
  return param;
}

function normalizeAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}
