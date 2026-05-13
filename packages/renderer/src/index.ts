// Public surface of @modcad/renderer.
// Apps and ui-kit consumers import the scene-graph API and the
// `createRenderer` factory from here; backends are loaded on demand.
export type {
  Camera,
  CreateRendererOptions,
  FrameStats,
  SceneRenderer,
} from "./api.js";
export { createRenderer } from "./api.js";
export {
  TileCache,
  TileInvalidationTracker,
  DEFAULT_TILE_CONFIG,
  bucketForZoom,
  shouldActivateTiles,
  tilesForViewport,
  tilesForBbox,
  tileKeyString,
} from "./pipelines/tiles.js";
export type { TileKey, TileCacheConfig } from "./pipelines/tiles.js";
export {
  tessellateArcsInWorker,
  isTessellationWorkerAvailable,
  TESSELLATION_GROWTH_THRESHOLD,
} from "./workers/tessellationClient.js";
export type {
  TessellationRequest,
  TessellationResponse,
  ArcTessellationInput,
} from "./workers/protocol.js";
