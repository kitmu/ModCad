// Main-thread client for the tessellation worker (T117).
//
// Resolves to a worker when one is available (browser + Worker API),
// otherwise falls back to a synchronous tessellate-in-place so callers
// don't need to branch.
//
// Threshold rationale: pushing arcs to a worker only pays off when the
// caller would otherwise stall the main thread for several ms. Below
// ~2000 newly-visible arcs in a frame the postMessage round-trip
// dominates; above it the parallelism wins.
import {
  tessellateArcsSync,
  type ArcTessellationInput,
  type TessellationRequest,
  type TessellationResponse,
} from "./protocol.js";
import { ARC_INPUT_STRIDE } from "./protocol.js";

/** Newly-visible-arc count above which we ship to the worker. */
export const TESSELLATION_GROWTH_THRESHOLD = 2000;

export function isTessellationWorkerAvailable(): boolean {
  return typeof Worker !== "undefined";
}

interface Pending {
  resolve: (r: TessellationResponse) => void;
  reject: (e: Error) => void;
}

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker | null {
  if (!isTessellationWorkerAvailable()) return null;
  if (workerInstance) return workerInstance;
  try {
    // The `new URL(..., import.meta.url)` pattern is the standard way
    // to ship a worker source file via Vite/Rollup. In non-bundled
    // contexts (Node tests) this branch is skipped via the
    // availability check above.
    workerInstance = new Worker(
      new URL("./tessellation.worker.js", import.meta.url),
      { type: "module" },
    );
    workerInstance.addEventListener(
      "message",
      (ev: MessageEvent<TessellationResponse>) => {
        const r = ev.data;
        const slot = pending.get(r.requestId);
        if (!slot) return;
        pending.delete(r.requestId);
        slot.resolve(r);
      },
    );
    workerInstance.addEventListener("error", (ev: ErrorEvent) => {
      for (const slot of pending.values()) {
        slot.reject(new Error(`tessellation worker error: ${ev.message}`));
      }
      pending.clear();
    });
    return workerInstance;
  } catch {
    // Some bundlers / runtimes throw on the URL constructor; degrade
    // to the sync path.
    workerInstance = null;
    return null;
  }
}

function packInputs(inputs: readonly ArcTessellationInput[]): Float32Array {
  const buf = new Float32Array(inputs.length * ARC_INPUT_STRIDE);
  for (let i = 0; i < inputs.length; i++) {
    const a = inputs[i] as ArcTessellationInput;
    const o = i * ARC_INPUT_STRIDE;
    buf[o] = a.cx;
    buf[o + 1] = a.cy;
    buf[o + 2] = a.r;
    buf[o + 3] = a.startRad;
    buf[o + 4] = a.sweepRad;
    buf[o + 5] = a.width;
    buf[o + 6] = a.pxPerUnit;
  }
  return buf;
}

/**
 * Tessellate arcs off-thread when possible. Returns a promise of
 * flat vertex strips. Always resolves — never rejects on the
 * fallback path. The caller decides whether to bother (use
 * {@link TESSELLATION_GROWTH_THRESHOLD}).
 */
export function tessellateArcsInWorker(
  inputs: readonly ArcTessellationInput[],
): Promise<TessellationResponse> {
  const packed = packInputs(inputs);
  const w = inputs.length < TESSELLATION_GROWTH_THRESHOLD ? null : ensureWorker();
  if (!w) {
    const t0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const { vertices, offsets } = tessellateArcsSync(packed);
    const t1 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    return Promise.resolve<TessellationResponse>({
      type: "tessellated",
      requestId: 0,
      vertices,
      offsets,
      elapsedMs: t1 - t0,
    });
  }
  const requestId = nextRequestId++;
  return new Promise<TessellationResponse>((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    const req: TessellationRequest = {
      type: "tessellate-arcs",
      requestId,
      arcs: packed,
    };
    // Transfer the input buffer to the worker — we won't read it again.
    w.postMessage(req, [packed.buffer]);
  });
}

/**
 * Test/teardown hook: drop the singleton worker so the next call
 * spawns a fresh one. Used by Vitest's afterEach.
 */
export function __resetTessellationClient(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  pending.clear();
  nextRequestId = 1;
}
