// Public surface of @modcad/core. Downstream packages (renderer, codecs,
// ui-kit, web) import from this module only.
export * from "./ids.js";
export * as Vec2 from "./geometry/Vec2.js";
export * as Mat3 from "./geometry/Mat3.js";
export * as Bbox from "./geometry/Bbox.js";
export type {
  Vec2 as Vec2Type,
} from "./geometry/Vec2.js";
export type {
  Mat3 as Mat3Type,
} from "./geometry/Mat3.js";
export type {
  Bbox as BboxType,
} from "./geometry/Bbox.js";
export type {
  Drawing,
  DrawingSettings,
  Layer,
  Entity,
  EntityKind,
  LineEntity,
  PolylineEntity,
  PolylineVertex,
  CircleEntity,
  ArcEntity,
  EllipseEntity,
  PointEntity,
  TextEntity,
  TextAlign,
  DimensionEntity,
  DimensionVariant,
  DimensionRef,
  EntityPointRef,
  EntityPointRefKind,
  PointStyle,
  PointStyleMode,
  PrecisionTier,
  Unit,
  RGBA,
  ColorRef,
  LineweightRef,
  SnapMode,
  KernelEvent,
} from "./scene/types.js";
export {
  newDrawing,
  defaultLayer,
  defaultSettings,
  getCurrentLayer,
  getLayer,
  getEntity,
  listVisibleEntities,
} from "./scene/Drawing.js";
export {
  TIER_A_LIMIT,
  TIER_B_LIMIT,
  REBASE_TRIGGER,
  classifyDistance,
  classifyBbox,
  shouldRebase,
  assertTierBOrBetter,
  TierCRefusedError,
} from "./scene/precisionRegime.js";
export { CommandBus } from "./commands/CommandBus.js";
export type { Command } from "./commands/CommandBus.js";
export { originRebaseCommand } from "./scene/originRebase.js";
export { DimensionGraph } from "./scene/dimensionGraph.js";
export { buildStaticIndex, DynamicIndex } from "./index/SpatialIndex.js";
export type { SpatialIndex } from "./index/SpatialIndex.js";
export { SnapEngine } from "./snap/SnapEngine.js";
export type {
  SnapCandidate,
  SnapEngineOptions,
  SnapStrength,
} from "./snap/SnapEngine.js";
