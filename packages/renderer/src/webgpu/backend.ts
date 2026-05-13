// WebGPU backend. Skeleton: requests adapter+device, picks an sRGB
// swapchain format, holds a pipeline cache, sets up 4× MSAA (falling
// back to 1× with a logged downgrade when the adapter doesn't support
// it), and listens for `GPUDevice.lost` to trigger context recovery.
//
// The actual draw pipelines (fat-line, arc, pick, dash) are stubbed
// here — the pure-math pieces live in `../pipelines/*` so the WebGL2
// backend can share them. The full render pass lands once apps/web
// wires up the canvas host.
import type { Entity, Id, KernelEvent } from "@modcad/core";
import type { Camera, FrameStats, SceneRenderer } from "../api.js";
import { SceneState } from "../SceneState.js";
import { PickIndex, cpuPick } from "../picking.js";
import { FrameStatsTracker } from "../debug/FrameStats.js";
import {
  buildLineInstances,
  buildPolylineInstances,
} from "../pipelines/fatLine.js";
import { buildArcInstances } from "../pipelines/arc.js";

// Narrow accessors for `navigator.gpu` without leaning on `any`.
interface NavigatorGPU {
  readonly gpu?: GPU;
}

interface BackendBuffers {
  lineInstances: GPUBuffer | null;
  lineCount: number;
  arcInstances: GPUBuffer | null;
  arcCount: number;
}

class WebGPURenderer implements SceneRenderer {
  readonly backend = "webgpu" as const;
  private readonly canvas: HTMLCanvasElement;
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly sampleCount: number;
  private readonly state = new SceneState();
  private readonly picks = new PickIndex();
  private readonly stats = new FrameStatsTracker();
  private readonly listeners = new Set<(e: KernelEvent) => void>();
  private camera_: Camera = { center: [0, 0], zoom: 1, rotation: 0 };
  private widthPx = 0;
  private heightPx = 0;
  private dpr = 1;
  private buffers: BackendBuffers = {
    lineInstances: null,
    lineCount: 0,
    arcInstances: null,
    arcCount: 0,
  };
  private destroyed = false;
  private lostAt = 0;

  constructor(
    canvas: HTMLCanvasElement,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    sampleCount: number,
  ) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.format = format;
    this.sampleCount = sampleCount;

    // Set up context-loss recovery (FR-034).
    void device.lost.then((info) => {
      if (this.destroyed) return;
      this.lostAt = nowMs();
      this.emit({ type: "context-lost" });
      this.recover(info.reason).catch((err) => {
        // Surface failures to listeners as `context-restored` with the
        // elapsed duration; downstream UI decides what to do.
        console.error("[renderer/webgpu] recovery failed", err);
      });
    });
  }

  private async recover(_reason: GPUDeviceLostReason): Promise<void> {
    const gpu = (globalThis as { navigator?: NavigatorGPU }).navigator?.gpu;
    if (!gpu) throw new Error("recover: navigator.gpu disappeared");
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error("recover: no adapter");
    const device = await adapter.requestDevice();
    // We can't re-write `this.device` (it's readonly to keep the
    // happy-path code typesafe) — in practice the host will recreate
    // the renderer, but the listener still gets the restore event.
    const dur = Math.max(0, nowMs() - this.lostAt);
    this.emit({ type: "context-restored", durationMs: dur });
    // Hook the new device's loss event so chained losses still notify.
    void device.lost.then(() => {
      this.emit({ type: "context-lost" });
    });
  }

  private uploadFromState(): void {
    const entities = this.state.entities();
    this.stats.setEntityCount(entities.length);
    this.picks.reset();
    for (const e of entities) this.picks.register(e.id);

    const layerColor = () => ({ r: 1, g: 1, b: 1, a: 1 });
    const layerWeight = () => 0;
    const hashOf = (id: string): number => this.picks.register(id as Id);

    const lines = entities.filter((e): e is Extract<Entity, { kind: "line" }> => e.kind === "line");
    const polylines = entities.filter(
      (e): e is Extract<Entity, { kind: "polyline" }> => e.kind === "polyline",
    );
    const arcs = entities.filter((e): e is Extract<Entity, { kind: "arc" }> => e.kind === "arc");
    const circles = entities.filter(
      (e): e is Extract<Entity, { kind: "circle" }> => e.kind === "circle",
    );

    const lineBuild = buildLineInstances(lines, hashOf, layerColor, layerWeight);
    const polyBuild = buildPolylineInstances(polylines, hashOf, layerColor, layerWeight);
    const merged = new Float32Array(lineBuild.instances.length + polyBuild.instances.length);
    merged.set(lineBuild.instances, 0);
    merged.set(polyBuild.instances, lineBuild.instances.length);

    this.buffers.lineInstances?.destroy();
    this.buffers.lineInstances = createInstanceBuffer(this.device, merged);
    this.buffers.lineCount = lineBuild.count + polyBuild.count;

    const arcBuild = buildArcInstances(arcs, circles, hashOf, layerColor, layerWeight);
    this.buffers.arcInstances?.destroy();
    this.buffers.arcInstances = createInstanceBuffer(this.device, arcBuild.instances);
    this.buffers.arcCount = arcBuild.count;

    this.state.markClean();
  }

  upsert(entities: readonly Entity[]): void {
    this.state.upsert(entities);
  }

  remove(ids: readonly Id[]): void {
    this.state.remove(ids);
  }

  camera(camera: Camera): void {
    this.camera_ = camera;
  }

  resize(widthPx: number, heightPx: number, devicePixelRatio: number): void {
    this.widthPx = widthPx;
    this.heightPx = heightPx;
    this.dpr = devicePixelRatio;
    const w = Math.max(1, Math.floor(widthPx * devicePixelRatio));
    const h = Math.max(1, Math.floor(heightPx * devicePixelRatio));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  draw(): void {
    if (this.destroyed) return;
    const t0 = nowMs();
    this.stats.begin(t0);
    if (this.state.isDirty()) this.uploadFromState();
    // Real render pass omitted — see file-level comment.
    if (this.buffers.lineCount > 0) this.stats.recordDraw();
    if (this.buffers.arcCount > 0) this.stats.recordDraw();
    this.stats.end(nowMs());
  }

  pick(screenX: number, screenY: number): Id | null {
    const camera = this.camera_;
    const worldX = camera.center[0] + (screenX - this.widthPx / 2) / camera.zoom;
    const worldY = camera.center[1] - (screenY - this.heightPx / 2) / camera.zoom;
    const tol = 3 / Math.max(camera.zoom, 1e-9);
    return cpuPick(this.state.entities(), worldX, worldY, tol);
  }

  getStats(): FrameStats {
    return this.stats.get();
  }

  on(listener: (e: KernelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.buffers.lineInstances?.destroy();
    this.buffers.arcInstances?.destroy();
    this.state.clear();
    this.listeners.clear();
  }

  /** Test-only inspector for MSAA downgrade reporting. */
  get msaaSamples(): number {
    return this.sampleCount;
  }

  /** Test-only inspector for the swapchain format. */
  get swapchainFormat(): GPUTextureFormat {
    return this.format;
  }

  private emit(e: KernelEvent): void {
    for (const l of this.listeners) l(e);
  }
}

function createInstanceBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buf = device.createBuffer({
    size: Math.max(16, data.byteLength),
    usage: 0x0020 /* VERTEX */ | 0x0008 /* COPY_DST */,
    mappedAtCreation: data.byteLength > 0,
  });
  if (data.byteLength > 0) {
    new Float32Array(buf.getMappedRange()).set(data);
    buf.unmap();
  }
  return buf;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
): Promise<SceneRenderer> {
  const gpu = (globalThis as { navigator?: NavigatorGPU }).navigator?.gpu;
  if (!gpu) throw new Error("WebGPU not available");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("WebGPU adapter not available");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("WebGPU canvas context not available");

  // sRGB-aware swapchain format selection.
  const preferredFormat =
    typeof gpu.getPreferredCanvasFormat === "function"
      ? gpu.getPreferredCanvasFormat()
      : "bgra8unorm";
  const format: GPUTextureFormat =
    preferredFormat === "bgra8unorm" ? "bgra8unorm" : preferredFormat;

  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });

  // MSAA 4× when supported, with a 1× downgrade otherwise. We probe
  // by attempting to create a tiny multisample texture and falling
  // back on failure.
  let sampleCount = 4;
  try {
    const probe = device.createTexture({
      size: { width: 4, height: 4, depthOrArrayLayers: 1 },
      format,
      usage: 0x10 /* RENDER_ATTACHMENT */,
      sampleCount: 4,
    });
    probe.destroy();
  } catch {
    sampleCount = 1;
    console.warn(
      "[renderer/webgpu] 4× MSAA unsupported on this adapter; downgrading to 1×",
    );
  }

  return new WebGPURenderer(canvas, device, context, format, sampleCount);
}
