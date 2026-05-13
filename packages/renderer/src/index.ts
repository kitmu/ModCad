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
