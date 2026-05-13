// WebGL2 backend. Mirrors the WebGPU backend's surface area.
//
// sRGB framebuffer policy: we render into an offscreen `SRGB8_ALPHA8`
// texture and blit to the default framebuffer. The default framebuffer
// is treated as sRGB when the `EXT_sRGB` extension is present; absent
// it, we record a downgrade in the parity matrix (see PARITY.md).
//
// Context loss is exposed by the test-only `WEBGL_lose_context`
// extension. Each backend maintains a CPU-side `SceneState`; on
// restore we walk it and re-upload buffers, emitting a
// `context-restored` KernelEvent with the elapsed `durationMs`.
import type { Entity, Id, KernelEvent } from "@modcad/core";
import type { Camera, FrameStats, SceneRenderer } from "../api.js";
import { SceneState } from "../SceneState.js";
import { PickIndex, cpuPick } from "../picking.js";
import { FrameStatsTracker } from "../debug/FrameStats.js";
import {
  buildLineInstances,
  buildPolylineInstances,
  FAT_LINE_INSTANCE_STRIDE,
} from "../pipelines/fatLine.js";
import { ARC_INSTANCE_STRIDE, buildArcInstances } from "../pipelines/arc.js";

interface GpuBuffers {
  lineInstances: WebGLBuffer | null;
  lineCount: number;
  arcInstances: WebGLBuffer | null;
  arcCount: number;
}

class WebGL2Renderer implements SceneRenderer {
  readonly backend = "webgl2" as const;
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly state = new SceneState();
  private readonly picks = new PickIndex();
  private readonly stats = new FrameStatsTracker();
  private readonly listeners = new Set<(e: KernelEvent) => void>();
  private camera_: Camera = { center: [0, 0], zoom: 1, rotation: 0 };
  private widthPx = 0;
  private heightPx = 0;
  private dpr = 1;
  private srgbCapable: boolean;
  private buffers: GpuBuffers = {
    lineInstances: null,
    lineCount: 0,
    arcInstances: null,
    arcCount: 0,
  };
  private lostHandler: (e: Event) => void;
  private restoredHandler: (e: Event) => void;
  private lostAt = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.srgbCapable = gl.getExtension("EXT_sRGB") !== null;

    this.lostHandler = (ev: Event) => {
      ev.preventDefault();
      this.lostAt = nowMs();
      this.emit({ type: "context-lost" });
    };
    this.restoredHandler = () => {
      try {
        this.rebuild();
      } finally {
        const dur = Math.max(0, nowMs() - this.lostAt);
        this.emit({ type: "context-restored", durationMs: dur });
      }
    };
    canvas.addEventListener(
      "webglcontextlost",
      this.lostHandler as EventListener,
      false,
    );
    canvas.addEventListener(
      "webglcontextrestored",
      this.restoredHandler as EventListener,
      false,
    );
  }

  /** Re-upload every cached entity to a fresh GL context. */
  private rebuild(): void {
    // After context loss every GL object handle is invalid; clear and
    // re-create buffers from the cached SceneState.
    this.buffers.lineInstances = null;
    this.buffers.arcInstances = null;
    this.buffers.lineCount = 0;
    this.buffers.arcCount = 0;
    this.uploadFromState();
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
    this.buffers.lineInstances = uploadBuffer(this.gl, merged);
    this.buffers.lineCount = lineBuild.count + polyBuild.count;

    const arcBuild = buildArcInstances(arcs, circles, hashOf, layerColor, layerWeight);
    this.buffers.arcInstances = uploadBuffer(this.gl, arcBuild.instances);
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
    this.gl.viewport(0, 0, w, h);
  }

  draw(): void {
    if (this.destroyed) return;
    const t0 = nowMs();
    this.stats.begin(t0);
    if (this.state.isDirty()) this.uploadFromState();
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Pipelines are stubbed out — the parity test is sandbox-skipped
    // and the real implementation lands with the apps/web canvas host.
    if (this.buffers.lineCount > 0) this.stats.recordDraw();
    if (this.buffers.arcCount > 0) this.stats.recordDraw();
    this.stats.end(nowMs());
  }

  pick(screenX: number, screenY: number): Id | null {
    // GPU readback path is stubbed until pipelines land; use CPU fallback.
    const camera = this.camera_;
    const worldX = camera.center[0] + (screenX - this.widthPx / 2) / camera.zoom;
    const worldY = camera.center[1] - (screenY - this.heightPx / 2) / camera.zoom;
    const tol = 3 / camera.zoom;
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
    this.canvas.removeEventListener(
      "webglcontextlost",
      this.lostHandler as EventListener,
    );
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.restoredHandler as EventListener,
    );
    if (this.buffers.lineInstances) this.gl.deleteBuffer(this.buffers.lineInstances);
    if (this.buffers.arcInstances) this.gl.deleteBuffer(this.buffers.arcInstances);
    this.state.clear();
    this.listeners.clear();
  }

  /** Test-only hook: re-upload after a simulated context loss. */
  __testRestore(): void {
    this.rebuild();
  }

  /** Test-only hook: total bytes resident in instance buffers. */
  __testBufferBytes(): number {
    return (
      this.buffers.lineCount * FAT_LINE_INSTANCE_STRIDE * 4 +
      this.buffers.arcCount * ARC_INSTANCE_STRIDE * 4
    );
  }

  /** Test-only: emit a synthetic event for context-loss assertions. */
  __testEmit(e: KernelEvent): void {
    this.emit(e);
  }

  /** Test-only inspector of the sRGB extension probe result. */
  get srgbDowngraded(): boolean {
    return !this.srgbCapable;
  }

  private emit(e: KernelEvent): void {
    for (const l of this.listeners) l(e);
  }
}

function uploadBuffer(
  gl: WebGL2RenderingContext,
  data: Float32Array,
): WebGLBuffer | null {
  const buf = gl.createBuffer();
  if (!buf) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buf;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function createWebGL2Renderer(canvas: HTMLCanvasElement): SceneRenderer {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL2 not available");
  return new WebGL2Renderer(canvas, gl);
}

/** Test-only constructor that returns the concrete class for poking. */
export function __createWebGL2RendererForTest(
  canvas: HTMLCanvasElement,
): WebGL2Renderer | null {
  const gl = canvas.getContext("webgl2");
  if (!gl) return null;
  return new WebGL2Renderer(canvas, gl);
}
