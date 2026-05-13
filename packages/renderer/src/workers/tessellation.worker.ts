// Web Worker for off-thread arc/ellipse tessellation (T117).
//
// Activated by the renderer when the visible-set growth per frame
// exceeds `TESSELLATION_GROWTH_THRESHOLD` (see tessellationClient.ts).
// Hand-rolled protocol — see workers/protocol.ts for the wire format.
//
// We do *not* import any DOM globals here. The worker has no `window`,
// no `document`, no fetch — only `self` (DedicatedWorkerGlobalScope).
//
// The actual maths is shared with the synchronous fallback in protocol.ts,
// so the worker's job is purely: receive, tessellate, post back with
// transferables.
import type {
  TessellationRequest,
  TessellationResponse,
} from "./protocol.js";
import { tessellateArcsSync } from "./protocol.js";

// `self` in a worker is the DedicatedWorkerGlobalScope. Cast minimally
// — we only need `addEventListener` + `postMessage`.
type WorkerSelf = {
  addEventListener(
    type: "message",
    handler: (ev: MessageEvent<TessellationRequest>) => void,
  ): void;
  postMessage(message: TessellationResponse, transfer: Transferable[]): void;
};

const ctx = self as unknown as WorkerSelf;

ctx.addEventListener("message", (ev: MessageEvent<TessellationRequest>) => {
  const req = ev.data;
  if (req.type !== "tessellate-arcs") return;
  const t0 = performance.now();
  const { vertices, offsets } = tessellateArcsSync(req.arcs);
  const response: TessellationResponse = {
    type: "tessellated",
    requestId: req.requestId,
    vertices,
    offsets,
    elapsedMs: performance.now() - t0,
  };
  // Transfer ownership so the main thread receives the buffers without
  // a copy. arcs ownership was already transferred *to* us, so it has
  // no further use here.
  ctx.postMessage(response, [vertices.buffer, offsets.buffer]);
});
