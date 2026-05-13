// Scene types per specs/001-2d-drafting-mvp/data-model.md.
// This file is the authoritative shape; the rest of @modcad/core imports
// from here, and downstream packages re-export selected types.
import type { Id } from "../ids.js";
import type { Vec2 } from "../geometry/Vec2.js";

export type Unit = "mm" | "cm" | "m" | "in" | "ft";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ColorRef = "byLayer" | RGBA;
export type LineweightRef = "byLayer" | number; // mm; 0 = hairline

// FR-008a + research.md snap modes.
export type SnapMode =
  | "endpoint"
  | "midpoint"
  | "center"
  | "node"
  | "intersection"
  | "perpendicular"
  | "tangent"
  | "nearest"
  | "parallel"
  | "grid";

// FR-001 POINT style modes (PDMODE-equivalent).
export type PointStyleMode =
  | "dot"
  | "none"
  | "plus"
  | "x"
  | "tick"
  | "circle"
  | "square"
  | "circle-plus"
  | "square-x";

export interface PointStyle {
  mode: PointStyleMode;
  size: number;
  sizeInPixels: boolean;
}

export interface DrawingSettings {
  grid: { visible: boolean; size: Vec2; snap: boolean };
  orthoMode: boolean;
  polarAngles: number[]; // radians, sorted
  snapModes: ReadonlySet<SnapMode>;
  pointStyle: PointStyle;
}

// Forward-declared here so `Drawing` can reference it without scene/types.ts
// taking a dependency on scene/dimensionStyle.ts (that file imports `Drawing`).
export interface DimensionStyleRecord {
  id: Id;
  name: string;
  arrowType: "closed-filled" | "open" | "tick" | "none";
  arrowSize: number;
  textHeight: number;
  textColor: ColorRef;
  extensionLineGap: number;
  dimensionLineOffset: number;
  precision: number;
  suppressZeros: boolean;
}

export interface Layer {
  id: Id;
  name: string;
  color: RGBA;
  lineweight: number; // mm
  visible: boolean;
  locked: boolean;
  frozen: boolean;
}

// Per data-model.md: Tier A 0–1e6, Tier B 1e6–1e9, Tier C >1e9 refused.
export type PrecisionTier = "A" | "B" | "C";

export interface Drawing {
  version: "1.0";
  units: Unit;
  precision: number; // 0–6 decimal places
  originOffset: Vec2; // rebased local origin
  precisionTier: PrecisionTier;
  layers: Layer[];
  layerOrder: Id[];
  currentLayerId: Id;
  entities: Record<Id, Entity>;
  entityOrder: Id[];
  settings: DrawingSettings;
  // FR-013 dimension styles: project-wide style record + the id of the
  // style new dimensions adopt by default. Existing files that lack
  // these fields are upgraded by `rehydrateDrawing` in the .modcad reader.
  dimensionStyles: Record<Id, DimensionStyleRecord>;
  defaultDimensionStyleId: Id;
  // Unknown top-level fields preserved on round-trip per FR Edge Case.
  extra: Record<string, unknown>;
}

interface EntityBase {
  id: Id;
  layerId: Id;
  color: ColorRef;
  lineweight: LineweightRef;
}

export interface LineEntity extends EntityBase {
  kind: "line";
  a: Vec2;
  b: Vec2;
}

export interface PolylineVertex {
  p: Vec2;
  // bulge encodes arc segments à la DXF: tan(included-angle/4). 0 = straight.
  bulge: number;
}

export interface PolylineEntity extends EntityBase {
  kind: "polyline";
  vertices: PolylineVertex[];
  closed: boolean;
}

export interface CircleEntity extends EntityBase {
  kind: "circle";
  c: Vec2;
  r: number;
}

export interface ArcEntity extends EntityBase {
  kind: "arc";
  c: Vec2;
  r: number;
  startAngle: number; // radians, ccw
  endAngle: number;
}

export interface EllipseEntity extends EntityBase {
  kind: "ellipse";
  c: Vec2;
  major: Vec2; // major-axis vector from center
  ratio: number; // minor/major
  startParam: number;
  endParam: number;
}

export interface PointEntity extends EntityBase {
  kind: "point";
  p: Vec2;
  // Per-entity override; otherwise DrawingSettings.pointStyle applies.
  styleOverride?: PointStyle;
}

export type TextAlign =
  | "tl" | "tc" | "tr"
  | "ml" | "mc" | "mr"
  | "bl" | "bc" | "br";

export interface TextEntity extends EntityBase {
  kind: "text";
  anchor: Vec2;
  height: number;
  rotation: number; // radians
  align: TextAlign;
  value: string;
  styleId: Id;
}

export type DimensionVariant = "linear" | "aligned" | "angular" | "radial" | "diameter";

export type EntityPointRefKind =
  | { kind: "endpoint"; index: 0 | 1 }
  | { kind: "midpoint" }
  | { kind: "vertex"; index: number }
  | { kind: "center" };

export interface EntityPointRef {
  entityId: Id;
  point: EntityPointRefKind;
}

export type DimensionRef =
  | { variant: "linear"; a: Vec2 | EntityPointRef; b: Vec2 | EntityPointRef; axis: "x" | "y" }
  | { variant: "aligned"; a: Vec2 | EntityPointRef; b: Vec2 | EntityPointRef }
  | { variant: "angular"; v: Vec2; a: Vec2 | EntityPointRef; b: Vec2 | EntityPointRef }
  | { variant: "radial"; entity: Id }
  | { variant: "diameter"; entity: Id };

export interface DimensionEntity extends EntityBase {
  kind: "dimension";
  variant: DimensionVariant;
  refs: DimensionRef;
  offset: number;
  styleId: Id;
}

export type Entity =
  | LineEntity
  | PolylineEntity
  | CircleEntity
  | ArcEntity
  | EllipseEntity
  | PointEntity
  | TextEntity
  | DimensionEntity;

export type EntityKind = Entity["kind"];

// Kernel-observable events surface to the UI for status-bar/toast wiring.
// See data-model.md "Renderer-observable events" and FR-034.
export type KernelEvent =
  | { type: "origin-rebased"; from: Vec2; to: Vec2 }
  | { type: "precision-tier-changed"; tier: PrecisionTier }
  | { type: "context-lost" }
  | { type: "context-restored"; durationMs: number };
