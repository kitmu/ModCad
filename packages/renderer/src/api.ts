// Declarative scene-graph API for the renderer. Backend-agnostic.
// See specs/001-2d-drafting-mvp/plan.md cross-cutting decisions and
// constitution Principle II (renderer parity matrix in PARITY.md).
import type { Entity, Id, KernelEvent, Vec2Type } from "@modcad/core";

export interface Camera {
  /** World-space center of the viewport. */
  center: Vec2Type;
  /** Pixels per world unit. */
  zoom: number;
  /** Radians, applied around `center`. */
  rotation: number;
}

export interface FrameStats {
  fps: number;
  drawCalls: number;
  entityCount: number;
  frameTimeMs: number;
}

export interface SceneRenderer {
  readonly backend: "webgpu" | "webgl2";
  /** Replace or insert entities; renderer keeps its own GPU-resident copy. */
  upsert(entities: readonly Entity[]): void;
  remove(ids: readonly Id[]): void;
  camera(camera: Camera): void;
  resize(widthPx: number, heightPx: number, devicePixelRatio: number): void;
  draw(): void;
  /** GPU-side hit-test against the entity ID buffer; CPU fallback if disabled. */
  pick(screenX: number, screenY: number): Id | null;
  getStats(): FrameStats;
  on(listener: (e: KernelEvent) => void): () => void;
  destroy(): void;
  /**
   * T116 — opt into the tile-based composite cache for far-zoom-out.
   * Default is off; backends that haven't wired the cache treat this
   * as a no-op. Toggle is transparent at the camera level: turning it
   * on never changes the rendered output, only the work spent.
   */
  setTileCacheEnabled?(enabled: boolean): void;
}

export interface CreateRendererOptions {
  canvas: HTMLCanvasElement;
  prefer?: "webgpu" | "webgl2";
}

/**
 * Try the preferred backend first; on failure fall back transparently.
 * `prefer` defaults to "webgpu".
 *
 * Lazy dynamic imports avoid pulling backend module code (and its
 * indirect references to browser-only globals such as `GPU*` types)
 * into callers that only want the type surface.
 */
export async function createRenderer(
  opts: CreateRendererOptions,
): Promise<SceneRenderer> {
  const prefer = opts.prefer ?? "webgpu";
  const order: Array<"webgpu" | "webgl2"> =
    prefer === "webgpu" ? ["webgpu", "webgl2"] : ["webgl2", "webgpu"];

  const errors: string[] = [];
  for (const backend of order) {
    try {
      if (backend === "webgpu") {
        const mod = await import("./webgpu/backend.js");
        return await mod.createWebGPURenderer(opts.canvas);
      }
      const mod = await import("./webgl2/backend.js");
      return mod.createWebGL2Renderer(opts.canvas);
    } catch (err) {
      errors.push(`${backend}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`No renderer backend available. Tried: ${errors.join("; ")}`);
}
