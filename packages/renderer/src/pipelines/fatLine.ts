// Fat-line pipeline. One instanced extruded quad per line segment.
//
// The instance buffer layout is identical between WebGPU and WebGL2 —
// both backends bind the same Float32Array. Each instance is:
//
//   layout (per-instance):
//     ax, ay   : segment start (world)
//     bx, by   : segment end   (world)
//     prevX,   : previous segment end (for miter at A)
//     prevY    : (set to ax/ay when there is no previous)
//     nextX,   : next segment start (for miter at B)
//     nextY    : (set to bx/by when there is no next)
//     r, g, b, a : color
//     width    : stroke width in world units
//     dashLen, gapLen : dash/gap pattern (0 = solid)
//     pickHash : 32-bit hash of the entity ULID
//
// Per-vertex quad (shared across all instances):
//     index 0,1,2,3 driven via the unit-corner attribute (sx, sy).
//     sx in {-1,+1} picks A vs B, sy in {-1,+1} picks the side.
//
// `miterLimit` (default 4) is consulted in the vertex shader; when the
// miter extension exceeds the limit it falls back to a bevel join.
//
// Cap style is selected via a per-pipeline flag (`butt`, `round`,
// `square`) and consumed by the fragment shader's analytic SDF.
import type { LineEntity, PolylineEntity, RGBA } from "@modcad/core";

export const FAT_LINE_INSTANCE_STRIDE = 16; // floats per instance
export const FAT_LINE_FLOATS_PER_INSTANCE = FAT_LINE_INSTANCE_STRIDE;

export type CapStyle = "butt" | "round" | "square";

export interface FatLineParams {
  miterLimit: number;
  cap: CapStyle;
  /** Pixels of feather for the analytic-SDF AA pass. */
  featherPx: number;
}

export const DEFAULT_FAT_LINE: FatLineParams = {
  miterLimit: 4,
  cap: "butt",
  featherPx: 1,
};

/** Quad corners shared by every instance. */
export const FAT_LINE_QUAD_CORNERS: Float32Array = new Float32Array([
  -1, -1,
  +1, -1,
  -1, +1,
  +1, +1,
]);

export const FAT_LINE_QUAD_INDICES: Uint16Array = new Uint16Array([0, 1, 2, 2, 1, 3]);

function resolveColor(color: RGBA | "byLayer", fallback: RGBA): RGBA {
  return color === "byLayer" ? fallback : color;
}

export interface LineSegmentInput {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  prevX: number;
  prevY: number;
  nextX: number;
  nextY: number;
  width: number;
  color: RGBA;
  dashLen: number;
  gapLen: number;
  pickHash: number;
}

/** Write one instance's worth of floats at `offset`. */
export function writeLineInstance(
  out: Float32Array,
  offset: number,
  seg: LineSegmentInput,
): void {
  if (out.length < offset + FAT_LINE_INSTANCE_STRIDE) {
    throw new Error("fat-line: instance buffer too small");
  }
  out[offset + 0] = seg.ax;
  out[offset + 1] = seg.ay;
  out[offset + 2] = seg.bx;
  out[offset + 3] = seg.by;
  out[offset + 4] = seg.prevX;
  out[offset + 5] = seg.prevY;
  out[offset + 6] = seg.nextX;
  out[offset + 7] = seg.nextY;
  out[offset + 8] = seg.color.r;
  out[offset + 9] = seg.color.g;
  out[offset + 10] = seg.color.b;
  out[offset + 11] = seg.color.a;
  out[offset + 12] = seg.width;
  out[offset + 13] = seg.dashLen;
  out[offset + 14] = seg.gapLen;
  out[offset + 15] = seg.pickHash;
}

export interface FatLineBuild {
  instances: Float32Array;
  count: number;
}

/** Build instance data for plain line entities. */
export function buildLineInstances(
  lines: readonly LineEntity[],
  pickHashOf: (id: string) => number,
  layerColor: (layerId: string) => RGBA,
  layerWeight: (layerId: string) => number,
): FatLineBuild {
  const count = lines.length;
  const out = new Float32Array(count * FAT_LINE_INSTANCE_STRIDE);
  for (let i = 0; i < count; i++) {
    const l = lines[i];
    if (!l) continue;
    const c = resolveColor(l.color, layerColor(l.layerId));
    const w = l.lineweight === "byLayer" ? layerWeight(l.layerId) : l.lineweight;
    writeLineInstance(out, i * FAT_LINE_INSTANCE_STRIDE, {
      ax: l.a[0],
      ay: l.a[1],
      bx: l.b[0],
      by: l.b[1],
      prevX: l.a[0],
      prevY: l.a[1],
      nextX: l.b[0],
      nextY: l.b[1],
      width: Math.max(w, 0),
      color: c,
      dashLen: 0,
      gapLen: 0,
      pickHash: pickHashOf(l.id),
    });
  }
  return { instances: out, count };
}

/**
 * Polylines: emit one fat-line instance per segment. `prev`/`next`
 * stitch to neighbouring segments so the vertex shader can compute
 * a miter (or bevel past `miterLimit`).
 */
export function buildPolylineInstances(
  polylines: readonly PolylineEntity[],
  pickHashOf: (id: string) => number,
  layerColor: (layerId: string) => RGBA,
  layerWeight: (layerId: string) => number,
): FatLineBuild {
  let total = 0;
  for (const p of polylines) {
    const n = p.vertices.length;
    total += p.closed ? n : Math.max(0, n - 1);
  }
  const out = new Float32Array(total * FAT_LINE_INSTANCE_STRIDE);
  let cursor = 0;
  for (const p of polylines) {
    const verts = p.vertices;
    const n = verts.length;
    if (n < 2) continue;
    const c = resolveColor(p.color, layerColor(p.layerId));
    const w = p.lineweight === "byLayer" ? layerWeight(p.layerId) : p.lineweight;
    const hash = pickHashOf(p.id);
    const segCount = p.closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      if (!a || !b) continue;
      const prev = i === 0 ? (p.closed ? verts[n - 1] : a) : verts[i - 1];
      const next =
        i === segCount - 1 ? (p.closed ? verts[(i + 2) % n] : b) : verts[i + 2];
      const pp = prev ?? a;
      const nn = next ?? b;
      writeLineInstance(out, cursor, {
        ax: a.p[0],
        ay: a.p[1],
        bx: b.p[0],
        by: b.p[1],
        prevX: pp.p[0],
        prevY: pp.p[1],
        nextX: nn.p[0],
        nextY: nn.p[1],
        width: Math.max(w, 0),
        color: c,
        dashLen: 0,
        gapLen: 0,
        pickHash: hash,
      });
      cursor += FAT_LINE_INSTANCE_STRIDE;
    }
  }
  return { instances: out, count: total };
}

/**
 * Compute the miter offset for a joint. Returns `null` if the miter
 * would exceed `miterLimit` — in which case the caller should bevel.
 *
 * Pure math, isolated for unit testing.
 */
export function miterOffset(
  prevDirX: number,
  prevDirY: number,
  nextDirX: number,
  nextDirY: number,
  miterLimit: number,
): { x: number; y: number } | null {
  // Average tangent (unit-ish).
  const tx = prevDirX + nextDirX;
  const ty = prevDirY + nextDirY;
  const tl = Math.hypot(tx, ty);
  if (tl < 1e-12) return null; // 180° turn — degenerate; bevel.
  const ntx = tx / tl;
  const nty = ty / tl;
  // Miter direction is perpendicular to the average tangent.
  const mx = -nty;
  const my = ntx;
  // Length is 1 / sin(theta/2) = 1 / |m · n| where n is prev normal.
  const pnx = -prevDirY;
  const pny = prevDirX;
  const denom = mx * pnx + my * pny;
  if (Math.abs(denom) < 1e-6) return null;
  const len = 1 / denom;
  if (Math.abs(len) > miterLimit) return null;
  return { x: mx * len, y: my * len };
}

/** Generic shared shader source — parameterised string constants the
 *  backends substitute into their pipeline modules. Both backends use
 *  identical algebra; only the wrapper syntax (WGSL vs GLSL) differs.
 */
export const FAT_LINE_VERTEX_ALGORITHM_DESCRIPTION = `
// Inputs:
//   corner        : vec2 in {-1,+1}²       (per-vertex)
//   a, b          : vec2 segment endpoints (per-instance)
//   prev, next    : vec2 adjacent endpoints (per-instance)
//   color         : vec4                    (per-instance)
//   width         : f32 world units         (per-instance)
//   miterLimit    : f32 uniform
//   view          : mat3 world->clip
// Output position:
//   1. pick endpoint by corner.x (-1 → a, +1 → b)
//   2. compute segment normal n = perp(normalize(b-a))
//   3. compute miter via miterOffset(prevDir, segDir, miterLimit)
//      and fall back to n on bevel.
//   4. extrude endpoint by side*width/2*join.
//   5. apply view transform.
// Output varying:
//   sideDist : signed perpendicular distance in pixels (for AA SDF)
//   capDist  : signed along-segment distance (for cap SDF)
//   arcLen   : world-space cumulative length along the line (for dashing)
`;
