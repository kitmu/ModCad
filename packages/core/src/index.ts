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
export type { Command, SubStep } from "./commands/CommandBus.js";
// Re-export immer's Draft so command authors (kernel + apps/web settings
// commands) don't need a direct immer dependency. apply/inverse always
// receive a Draft<Drawing>.
export type { Draft } from "immer";
export { drawLineCommand } from "./commands/draw/drawLine.js";
export type { DrawLineParams } from "./commands/draw/drawLine.js";
export { drawRectangleCommand } from "./commands/draw/drawRectangle.js";
export type { DrawRectangleParams } from "./commands/draw/drawRectangle.js";
export {
  drawCircleCenterRadiusCommand,
  drawCircle2PointCommand,
  drawCircle3PointCommand,
  CollinearError,
} from "./commands/draw/drawCircle.js";
export type {
  DrawCircleCenterRadiusParams,
  DrawCircle2PointParams,
  DrawCircle3PointParams,
} from "./commands/draw/drawCircle.js";
export {
  drawArcCenterEndsCommand,
  drawArc3PointCommand,
} from "./commands/draw/drawArc.js";
export type {
  DrawArcCenterEndsParams,
  DrawArc3PointParams,
} from "./commands/draw/drawArc.js";
export {
  drawPolylineCommand,
  startPolyline,
} from "./commands/draw/drawPolyline.js";
export type {
  DrawPolylineParams,
  PolylineDraft,
} from "./commands/draw/drawPolyline.js";
export { drawEllipseCommand } from "./commands/draw/drawEllipse.js";
export type { DrawEllipseParams } from "./commands/draw/drawEllipse.js";
export { drawPointCommand } from "./commands/draw/drawPoint.js";
export type { DrawPointParams } from "./commands/draw/drawPoint.js";
export { parseCoord } from "./commands/parseCoord.js";
export type { ParseContext, ParseResult } from "./commands/parseCoord.js";
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
