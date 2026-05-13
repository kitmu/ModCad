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
export { CommandRegistry, builtinRegistry } from "./commands/registry.js";
export type { CommandDefinition } from "./commands/registry.js";
export { originRebaseCommand } from "./scene/originRebase.js";
export { DimensionGraph } from "./scene/dimensionGraph.js";
export { buildStaticIndex, DynamicIndex } from "./index/SpatialIndex.js";
export type { SpatialIndex } from "./index/SpatialIndex.js";
export {
  bboxOfEntity,
  bboxOfEntities,
  bboxOfLine,
  bboxOfPolyline,
  bboxOfCircle,
  bboxOfArc,
  bboxOfEllipse,
  bboxOfPoint,
} from "./geometry/primitives.js";
export { SnapEngine } from "./snap/SnapEngine.js";
export type {
  SnapCandidate,
  SnapEngineOptions,
  SnapStrength,
} from "./snap/SnapEngine.js";
// Layer commands — FR-010, FR-012.
export { addLayerCommand } from "./commands/layers/addLayer.js";
export type { AddLayerParams, AddLayerResult } from "./commands/layers/addLayer.js";
export { removeLayerCommand } from "./commands/layers/removeLayer.js";
export type { RemoveLayerParams } from "./commands/layers/removeLayer.js";
export { renameLayerCommand } from "./commands/layers/renameLayer.js";
export type { RenameLayerParams } from "./commands/layers/renameLayer.js";
export {
  setLayerVisibleCommand,
  setLayerLockedCommand,
  setLayerFrozenCommand,
} from "./commands/layers/setLayerFlag.js";
export type {
  SetLayerVisibleParams,
  SetLayerLockedParams,
  SetLayerFrozenParams,
} from "./commands/layers/setLayerFlag.js";
export { setLayerColorCommand } from "./commands/layers/setLayerColor.js";
export type { SetLayerColorParams } from "./commands/layers/setLayerColor.js";
export { setLayerLineweightCommand } from "./commands/layers/setLayerLineweight.js";
export type { SetLayerLineweightParams } from "./commands/layers/setLayerLineweight.js";
export { reorderLayerCommand } from "./commands/layers/reorderLayer.js";
export type { ReorderLayerParams } from "./commands/layers/reorderLayer.js";
export { setCurrentLayerCommand } from "./commands/layers/setCurrentLayer.js";
export type { SetCurrentLayerParams } from "./commands/layers/setCurrentLayer.js";
export {
  LayerLockedError,
  LayerFrozenError,
  UndeletableLayerError,
  LayerNotFoundError,
} from "./commands/layers/errors.js";
// Entity-style modify commands — FR-011.
export { setEntityLayerCommand } from "./commands/modify/setEntityLayer.js";
export type { SetEntityLayerParams } from "./commands/modify/setEntityLayer.js";
export { setEntityColorCommand } from "./commands/modify/setEntityColor.js";
export type { SetEntityColorParams } from "./commands/modify/setEntityColor.js";
export { setEntityLineweightCommand } from "./commands/modify/setEntityLineweight.js";
export type { SetEntityLineweightParams } from "./commands/modify/setEntityLineweight.js";
// Renderer-side byLayer resolution.
export {
  effectiveColor,
  effectiveLineweight,
  isHidden,
  resolveStyle,
} from "./scene/effectiveStyle.js";
// Settings commands — FR-015b.
export { changeUnitsCommand } from "./commands/settings/changeUnits.js";
export type { ChangeUnitsParams } from "./commands/settings/changeUnits.js";
// US6 modify commands — FR-005.
export { moveCommand } from "./commands/modify/move.js";
export type { MoveParams } from "./commands/modify/move.js";
export { copyCommand } from "./commands/modify/copy.js";
export type { CopyParams } from "./commands/modify/copy.js";
export { rotateCommand } from "./commands/modify/rotate.js";
export type { RotateParams } from "./commands/modify/rotate.js";
export {
  scaleCommand,
  InvalidScaleFactorError,
} from "./commands/modify/scale.js";
export type { ScaleParams } from "./commands/modify/scale.js";
export {
  mirrorCommand,
  DegenerateMirrorAxisError,
} from "./commands/modify/mirror.js";
export type { MirrorParams } from "./commands/modify/mirror.js";
export { arrayRectCommand } from "./commands/modify/arrayRect.js";
export type { ArrayRectParams } from "./commands/modify/arrayRect.js";
export { arrayPolarCommand } from "./commands/modify/arrayPolar.js";
export type { ArrayPolarParams } from "./commands/modify/arrayPolar.js";
export {
  offsetCommand,
  UnsupportedOffsetError,
} from "./commands/modify/offset.js";
export type { OffsetParams } from "./commands/modify/offset.js";
export {
  trimCommand,
  UnsupportedTrimError,
} from "./commands/modify/trim.js";
export type { TrimParams } from "./commands/modify/trim.js";
export {
  extendCommand,
  UnsupportedExtendError,
} from "./commands/modify/extend.js";
export type { ExtendParams } from "./commands/modify/extend.js";
export {
  filletCommand,
  UnsupportedFilletError,
} from "./commands/modify/fillet.js";
export type { FilletParams } from "./commands/modify/fillet.js";
export {
  chamferCommand,
  UnsupportedChamferError,
} from "./commands/modify/chamfer.js";
export type { ChamferParams } from "./commands/modify/chamfer.js";
export {
  modifyGeometryCommand,
  InvalidGripTargetError,
} from "./commands/modify/modifyGeometry.js";
export type {
  ModifyGeometryParams,
  GeometryMember,
} from "./commands/modify/modifyGeometry.js";
