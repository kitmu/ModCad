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
| Instanced fat-line rendering | planned | planned | T035 |
| Instanced arc + analytic AA | planned | planned | T036 |
| Vertex-shader dash generation | planned | planned | T037 |
| GPU-side pick pass (entity IDs to render target) | planned | planned (CPU fallback) | T038 — WebGL2 may fall back to CPU rasterization for picking on older drivers |
| Compute-shader spatial-index build | future | n/a | If/when implemented, WebGL2 falls back to the CPU rbush/flatbush path |
| Compute-shader hatch flood fill | future | n/a | If/when implemented, WebGL2 falls back to a CPU/marching-squares path |

## How this file is enforced

- CI (`render-parity` job) runs `pnpm --filter @modcad/renderer test:parity`.
- The parity test renders `benchmarks/scenes/parity.json` through both
  backends off-screen, diffs the framebuffers, and fails on >0.05%
  per-channel pixel differences.
- An i18n-audit-style script (T127a-friendly) asserts every
  compute-only feature in the source tree has a row in this table.
