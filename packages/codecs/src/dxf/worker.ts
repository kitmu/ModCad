// DXF parsing off the main thread.
//
// `parseDxfInWorker` spawns a worker, sends it the DXF source, and
// resolves with the parsed result. In Node (no `Worker`) or any
// environment without `URL.createObjectURL`, we fall back to running
// the parser synchronously — the public contract stays the same.
//
// A hand-rolled postMessage protocol keeps us off any new runtime
// dependency (comlink would add ~6KB gzipped for one entry point).
//
// The codecs tsconfig restricts lib to ES2022, so DOM types
// (`Worker`, `Blob`, `URL`) are referenced through `globalThis` and
// narrowed at the boundary.
import { readDxf, type DxfReadResult } from "./read.js";

interface WorkerLike {
  postMessage: (msg: unknown) => void;
  terminate: () => void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((err: unknown) => void) | null;
}

interface WorkerCtor {
  new (url: string, opts?: { type?: "module" }): WorkerLike;
}

interface UrlGlobal {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL: (url: string) => void;
}

interface BlobCtor {
  new (parts: string[], opts?: { type?: string }): unknown;
}

interface MaybeBrowserGlobals {
  Worker?: WorkerCtor;
  URL?: UrlGlobal;
  Blob?: BlobCtor;
}

const WORKER_SOURCE = `
self.onmessage = async (ev) => {
  const { id, source } = ev.data;
  try {
    const mod = await import("@modcad/codecs");
    const result = mod.readDxf(source);
    self.postMessage({ type: "result", id, payload: result });
  } catch (err) {
    self.postMessage({ type: "error", id, payload: String(err) });
  }
};
`;

let counter = 0;

export async function parseDxfInWorker(source: string): Promise<DxfReadResult> {
  const g = globalThis as unknown as MaybeBrowserGlobals;
  if (!g.Worker || !g.URL || !g.Blob) {
    // Node/test fallback — synchronous parse keeps the contract.
    return readDxf(source);
  }
  const blob = new g.Blob([WORKER_SOURCE], { type: "text/javascript" });
  const url = g.URL.createObjectURL(blob);
  const worker = new g.Worker(url, { type: "module" });
  const id = ++counter;
  try {
    return await new Promise<DxfReadResult>((resolve, reject) => {
      worker.onmessage = (ev) => {
        const data = ev.data as { type: string; id: number; payload: unknown };
        if (data.id !== id) return;
        if (data.type === "result") {
          resolve(data.payload as DxfReadResult);
        } else {
          reject(new Error(String(data.payload)));
        }
      };
      worker.onerror = (err) => reject(err instanceof Error ? err : new Error(String(err)));
      worker.postMessage({ type: "parse", id, source });
    });
  } finally {
    worker.terminate();
    g.URL.revokeObjectURL(url);
  }
}
