# Renderer parity matrix

Per Constitution Principle II: the scene API must achieve visual
parity within a documented per-pixel tolerance on canonical scenes
between the WebGPU and WebGL2 backends, plus a feature parity matrix
listing any compute-only features that degrade or disable on WebGL2.

Pixel-identity is **not** a CI gate. Tolerance is `≤ 0.05% pixel
diff` on canonical scenes (subject to quarterly review).

## Feature parity status

| Feature | WebGPU | WebGL2 | Notes |
|---|---|---|---|
| Scene-graph API (`createRenderer`) | landed (skeleton) | landed (skeleton) | T032 — pipelines stubbed; draw is a clear pass until apps/web wires the canvas host |
| Instanced fat-line geometry/instance layout | landed (shared) | landed (shared) | T035 — `packages/renderer/src/pipelines/fatLine.ts` shared by both backends. Miter joins with `miterLimit=4`, bevel fallback past the limit, butt/round/square caps. Analytic-SDF AA (1 px feather). |
| Instanced arc + analytic AA | landed (shared math) | landed (shared math) | T036 — `pipelines/arc.ts` |
| Vertex-shader dash generation | landed (shared math) | landed (shared math) | T037 — `pipelines/dash.ts` — period derived in vertex shader from world-space arc length so zoom doesn't re-tessellate. |
| GPU-side pick pass (entity IDs to render target) | CPU fallback active | CPU fallback active | T038 — `src/picking.ts` exposes the FNV-1a 32-bit hash, `PickIndex` map, and brute-force CPU fallback. Full GPU readback lands with the canvas host. |
| Context-loss recovery (FR-034) | landed | landed | T039a — WebGPU listens on `GPUDevice.lost`; WebGL2 on `webglcontextlost`/`webglcontextrestored`. Both emit `context-lost`/`context-restored{durationMs}` KernelEvents and re-upload from the cached `SceneState`. |
| sRGB working space | `bgra8unorm` preferred (sRGB-aware swapchain) | `SRGB8_ALPHA8` offscreen + `EXT_sRGB` for default framebuffer | Constitution Principle II. Without `EXT_sRGB` the default framebuffer is treated as linear; this is a documented downgrade. |
| MSAA 4× | runtime probe with 1× downgrade + `console.warn` | driver-default antialias via `getContext("webgl2", { antialias: true })` | If the adapter rejects `sampleCount: 4`, WebGPU downgrades to 1× and logs. |
| Compute-shader spatial-index build | future | n/a | If/when implemented, WebGL2 falls back to the CPU rbush/flatbush path |
| Compute-shader hatch flood fill | future | n/a | If/when implemented, WebGL2 falls back to a CPU/marching-squares path |

## How this file is enforced

- CI (`render-parity` job) runs `pnpm --filter @modcad/renderer test:parity`.
- The parity test renders `benchmarks/scenes/parity.json` through both
  backends off-screen, diffs the framebuffers, and fails on >0.05%
  per-channel pixel differences.
- An i18n-audit-style script (T127a-friendly) asserts every
  compute-only feature in the source tree has a row in this table.
