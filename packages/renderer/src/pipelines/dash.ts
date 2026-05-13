// Dashed-line math, shared between WebGPU and WebGL2 backends.
//
// Strategy: dash patterns are sampled in the vertex shader against the
// camera-space arc-length parameter so zooming doesn't re-tessellate
// the geometry. The fragment shader resolves visibility from a single
// scalar varying.
//
// `arcLen` is the cumulative world-space length along the line up to
// the current fragment; `dashLen` and `gapLen` come in as per-instance
// uniforms (zero means "solid"). The shader returns:
//
//   visible = mod(arcLen, dashLen + gapLen) < dashLen
//
// This file holds the CPU reference implementation used by the parity
// test and unit tests.

export interface DashPattern {
  /** Length of the on segment in world units. 0 = solid. */
  dashLen: number;
  /** Length of the off segment in world units. 0 = solid. */
  gapLen: number;
}

export const SOLID: DashPattern = { dashLen: 0, gapLen: 0 };

/** Returns true when a fragment at `arcLen` is opaque under `pattern`. */
export function isDashVisible(arcLen: number, pattern: DashPattern): boolean {
  if (pattern.dashLen <= 0 || pattern.gapLen <= 0) return true;
  const period = pattern.dashLen + pattern.gapLen;
  const phase = arcLen - Math.floor(arcLen / period) * period;
  return phase < pattern.dashLen;
}

/** Soft visibility for AA, returning a value in [0,1].
 *
 *  The coverage ramps linearly across `featherWorld` world units centered
 *  on each on→off and off→on edge. At the edge itself coverage is 0.5.
 */
export function dashCoverage(
  arcLen: number,
  pattern: DashPattern,
  featherWorld: number,
): number {
  if (pattern.dashLen <= 0 || pattern.gapLen <= 0) return 1;
  const period = pattern.dashLen + pattern.gapLen;
  const phase = arcLen - Math.floor(arcLen / period) * period;
  if (featherWorld <= 0) {
    return phase < pattern.dashLen ? 1 : 0;
  }
  // Signed distance from phase to the rising edge (0) and falling edge (dashLen).
  // Inside the dash, distance to the nearest edge is positive; outside negative.
  const inside = phase < pattern.dashLen;
  const d = inside
    ? Math.min(phase, pattern.dashLen - phase)
    : -Math.min(phase - pattern.dashLen, period - phase);
  return Math.max(0, Math.min(1, d / featherWorld + 0.5));
}
