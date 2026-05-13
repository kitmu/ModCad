// Off-thread tessellation worker protocol (T117).
//
// Hand-rolled wire format. No comlink. The main thread sends batched
// arc/ellipse inputs as a typed array (transferable) plus a small
// header; the worker writes per-arc vertex strips back into another
// typed array and transfers ownership home. Keeping the wire format
// flat lets us drop into a SharedArrayBuffer + Atomics path later
// without a contract churn.
//
// The worker file at workers/tessellation.worker.ts imports this module
// for the shared type definitions only — no runtime symbols cross.

export interface ArcTessellationInput {
  /** Center X, Y in world units. */
  cx: number;
  cy: number;
  /** Radius in world units. */
  r: number;
  /** Sweep start in radians. */
  startRad: number;
  /** Sweep extent in radians; sign encodes direction. */
  sweepRad: number;
  /** Stroke width in world units; passed through to the renderer. */
  width: number;
  /** Approximate pixels-per-world-unit; drives segment count. */
  pxPerUnit: number;
}

export interface TessellationRequest {
  readonly type: "tessellate-arcs";
  /** Per-request id so the client can correlate responses. */
  readonly requestId: number;
  /** Flat float buffer; 7 floats per arc, ordered as in ArcTessellationInput. */
  readonly arcs: Float32Array;
}

export interface TessellationResponse {
  readonly type: "tessellated";
  readonly requestId: number;
  /** Flat float buffer of vertex pairs: x0,y0,x1,y1,…  */
  readonly vertices: Float32Array;
  /** Per-input offset into `vertices` where the strip starts; length = inputs+1. */
  readonly offsets: Uint32Array;
  /** Wall-clock ms the worker spent tessellating (telemetry). */
  readonly elapsedMs: number;
}

export const ARC_INPUT_STRIDE = 7;

/**
 * Compute segment count for an arc — enough that the chord-error stays
 * below ~0.5 px on screen at the given pxPerUnit. Linear in the sweep
 * angle; constants match the inline tessellator in arc.ts.
 */
export function arcSegmentCount(
  r: number,
  sweepRad: number,
  pxPerUnit: number,
): number {
  const screenRadius = Math.max(1, r * pxPerUnit);
  const minSegments = 6;
  const maxSegments = 256;
  const target = Math.ceil(Math.abs(sweepRad) * Math.sqrt(screenRadius) * 1.5);
  return Math.min(maxSegments, Math.max(minSegments, target));
}

/**
 * Synchronous fallback tessellator. Used by tests and as the in-line
 * implementation when no worker is available (e.g. Node, very old
 * Safari). Same output as the worker version so swapping them is a
 * non-event for callers.
 */
export function tessellateArcsSync(arcs: Float32Array): {
  vertices: Float32Array;
  offsets: Uint32Array;
} {
  const count = arcs.length / ARC_INPUT_STRIDE;
  if (count === 0) {
    return { vertices: new Float32Array(0), offsets: new Uint32Array(1) };
  }
  const offsets = new Uint32Array(count + 1);
  // First pass: count vertices so we can allocate the output exactly.
  let total = 0;
  const segCounts = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * ARC_INPUT_STRIDE;
    const r = arcs[o + 2] as number;
    const sweep = arcs[o + 4] as number;
    const px = arcs[o + 6] as number;
    const segs = arcSegmentCount(r, sweep, px);
    segCounts[i] = segs;
    offsets[i] = total;
    // (segs + 1) vertices per strip, 2 floats each.
    total += (segs + 1) * 2;
  }
  offsets[count] = total;
  const vertices = new Float32Array(total);
  for (let i = 0; i < count; i++) {
    const o = i * ARC_INPUT_STRIDE;
    const cx = arcs[o] as number;
    const cy = arcs[o + 1] as number;
    const r = arcs[o + 2] as number;
    const start = arcs[o + 3] as number;
    const sweep = arcs[o + 4] as number;
    const segs = segCounts[i] as number;
    let v = offsets[i] as number;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const a = start + sweep * t;
      vertices[v++] = cx + Math.cos(a) * r;
      vertices[v++] = cy + Math.sin(a) * r;
    }
  }
  return { vertices, offsets };
}
