// Instanced arc pipeline. One quad covering the arc's bbox per instance.
// The fragment shader computes the analytic signed distance to the arc
// (|length(p - center) - r|) and discards / AA-feathers using that
// distance. Caps reuse the fat-line cap SDFs.
//
// Buffer layout (per instance, floats):
//   0,1   cx, cy
//   2     radius
//   3     width (world units)
//   4     startAngle (radians)
//   5     endAngle   (radians)
//   6,7,8,9 color rgba
//   10    dashLen
//   11    gapLen
//   12    pickHash
//   13    _pad   (align to 14 → round up to 16 for std140-safe layout)
//   14    _pad
//   15    _pad
import type { ArcEntity, CircleEntity, RGBA } from "@modcad/core";

export const ARC_INSTANCE_STRIDE = 16;

export interface ArcInstanceInput {
  cx: number;
  cy: number;
  radius: number;
  width: number;
  startAngle: number;
  endAngle: number;
  color: RGBA;
  dashLen: number;
  gapLen: number;
  pickHash: number;
}

export function writeArcInstance(
  out: Float32Array,
  offset: number,
  arc: ArcInstanceInput,
): void {
  if (out.length < offset + ARC_INSTANCE_STRIDE) {
    throw new Error("arc: instance buffer too small");
  }
  out[offset + 0] = arc.cx;
  out[offset + 1] = arc.cy;
  out[offset + 2] = arc.radius;
  out[offset + 3] = arc.width;
  out[offset + 4] = arc.startAngle;
  out[offset + 5] = arc.endAngle;
  out[offset + 6] = arc.color.r;
  out[offset + 7] = arc.color.g;
  out[offset + 8] = arc.color.b;
  out[offset + 9] = arc.color.a;
  out[offset + 10] = arc.dashLen;
  out[offset + 11] = arc.gapLen;
  out[offset + 12] = arc.pickHash;
  out[offset + 13] = 0;
  out[offset + 14] = 0;
  out[offset + 15] = 0;
}

function resolveColor(color: RGBA | "byLayer", fallback: RGBA): RGBA {
  return color === "byLayer" ? fallback : color;
}

export interface ArcBuild {
  instances: Float32Array;
  count: number;
}

export function buildArcInstances(
  arcs: readonly ArcEntity[],
  circles: readonly CircleEntity[],
  pickHashOf: (id: string) => number,
  layerColor: (layerId: string) => RGBA,
  layerWeight: (layerId: string) => number,
): ArcBuild {
  const count = arcs.length + circles.length;
  const out = new Float32Array(count * ARC_INSTANCE_STRIDE);
  let cursor = 0;
  for (const a of arcs) {
    const c = resolveColor(a.color, layerColor(a.layerId));
    const w = a.lineweight === "byLayer" ? layerWeight(a.layerId) : a.lineweight;
    writeArcInstance(out, cursor, {
      cx: a.c[0],
      cy: a.c[1],
      radius: a.r,
      width: Math.max(w, 0),
      startAngle: a.startAngle,
      endAngle: a.endAngle,
      color: c,
      dashLen: 0,
      gapLen: 0,
      pickHash: pickHashOf(a.id),
    });
    cursor += ARC_INSTANCE_STRIDE;
  }
  for (const ce of circles) {
    const c = resolveColor(ce.color, layerColor(ce.layerId));
    const w = ce.lineweight === "byLayer" ? layerWeight(ce.layerId) : ce.lineweight;
    writeArcInstance(out, cursor, {
      cx: ce.c[0],
      cy: ce.c[1],
      radius: ce.r,
      width: Math.max(w, 0),
      startAngle: 0,
      endAngle: Math.PI * 2,
      color: c,
      dashLen: 0,
      gapLen: 0,
      pickHash: pickHashOf(ce.id),
    });
    cursor += ARC_INSTANCE_STRIDE;
  }
  return { instances: out, count };
}

/**
 * Pure-math signed distance from point `p` to an arc segment. Used by:
 *   * the CPU pick fallback
 *   * the parity test reference (off-screen rasterization)
 */
export function arcSdf(
  px: number,
  py: number,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): number {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.hypot(dx, dy);
  // Angle of p relative to center, in [-PI, PI]:
  let theta = Math.atan2(dy, dx);
  // Normalize endpoints so end > start; treat full circle (>= 2π span) as ring.
  const s = startAngle;
  let e = endAngle;
  while (e < s) e += Math.PI * 2;
  while (theta < s) theta += Math.PI * 2;
  if (theta <= e) {
    return Math.abs(dist - radius);
  }
  // Closest endpoint cap distance.
  const ax = cx + Math.cos(s) * radius;
  const ay = cy + Math.sin(s) * radius;
  const bx = cx + Math.cos(e) * radius;
  const by = cy + Math.sin(e) * radius;
  const da = Math.hypot(px - ax, py - ay);
  const db = Math.hypot(px - bx, py - by);
  return Math.min(da, db);
}
