# Phase 1 Data Model: 2D Drafting MVP

The model lives in `packages/core/scene`. Everything below is plain
TypeScript; nothing imports React, Vite, or a renderer.

## Core types

```ts
type Id = string; // ULID

type Vec2 = readonly [number, number];

type RGBA = { r: number; g: number; b: number; a: number };

type ColorRef = "byLayer" | RGBA;
type LineweightRef = "byLayer" | number; // mm, 0 = hairline

type Unit = "mm" | "cm" | "m" | "in" | "ft";

interface Drawing {
  version: "1.0";
  units: Unit;
  precision: number;     // 0–6 decimal places, or fractional inches when units = "in" | "ft"
  originOffset: Vec2;    // rebased; user coordinates = entity coords + originOffset
  layers: Layer[];
  layerOrder: Id[];      // explicit z-order; UI honors this
  currentLayerId: Id;
  entities: Record<Id, Entity>;
  entityOrder: Id[];     // creation order, used for tie-breaking selection
  settings: DrawingSettings;
  extra: Record<string, unknown>;  // unknown fields preserved on round-trip
}

interface Layer {
  id: Id;
  name: string;
  color: RGBA;
  lineweight: number;    // mm
  visible: boolean;
  locked: boolean;
  frozen: boolean;       // skipped by regen entirely
}

interface DrawingSettings {
  grid: { visible: boolean; size: Vec2; snap: boolean };
  orthoMode: boolean;
  polarAngles: number[]; // radians, sorted
  snapModes: Set<SnapMode>;
}
```

## Entity discriminated union

```ts
type Entity =
  | LineEntity
  | PolylineEntity
  | CircleEntity
  | ArcEntity
  | EllipseEntity
  | TextEntity
  | DimensionEntity;

interface EntityBase {
  id: Id;
  layerId: Id;
  color: ColorRef;
  lineweight: LineweightRef;
}

interface LineEntity extends EntityBase {
  kind: "line";
  a: Vec2; b: Vec2;
}

interface PolylineEntity extends EntityBase {
  kind: "polyline";
  vertices: Array<{ p: Vec2; bulge: number }>;  // bulge for arc segments
  closed: boolean;
}

interface CircleEntity extends EntityBase {
  kind: "circle";
  c: Vec2; r: number;
}

interface ArcEntity extends EntityBase {
  kind: "arc";
  c: Vec2; r: number; startAngle: number; endAngle: number;  // ccw
}

interface EllipseEntity extends EntityBase {
  kind: "ellipse";
  c: Vec2; major: Vec2; ratio: number; startParam: number; endParam: number;
}

interface TextEntity extends EntityBase {
  kind: "text";
  anchor: Vec2; height: number; rotation: number;
  align: "tl"|"tc"|"tr"|"ml"|"mc"|"mr"|"bl"|"bc"|"br";
  value: string; styleId: Id;
}

type DimensionKind = "linear" | "aligned" | "angular" | "radial" | "diameter";
interface DimensionEntity extends EntityBase {
  kind: "dimension";
  variant: DimensionKind;
  refs: DimensionRef;
  offset: number;        // dimension-line offset from referent
  styleId: Id;
  // text override is computed; users may override per FR-013 future work
}

type DimensionRef =
  | { variant: "linear"; a: Vec2 | EntityPointRef; b: Vec2 | EntityPointRef; axis: "x"|"y" }
  | { variant: "aligned"; a: Vec2 | EntityPointRef; b: Vec2 | EntityPointRef }
  | { variant: "angular"; v: Vec2; a: Vec2 | EntityPointRef; b: Vec2 | EntityPointRef }
  | { variant: "radial"; entity: Id }
  | { variant: "diameter"; entity: Id };

// An EntityPointRef binds a dimension to a snap point on an entity so it
// can re-flow when the entity moves (FR-014). Resolved at render time.
type EntityPointRef = { entityId: Id; point:
  | { kind: "endpoint"; index: 0 | 1 }
  | { kind: "midpoint" }
  | { kind: "vertex"; index: number }
  | { kind: "center" } };
```

## Commands

```ts
interface CommandContext {
  drawing: Drawing;
}

interface Command<Params = unknown> {
  name: string;                 // "draw.line", "modify.trim", …
  params: Params;
  apply(draft: Drawing): void;  // mutate the Immer draft
  inverse(draft: Drawing): void;
  // For multi-step commands (FR-006a)
  subSteps?: { apply(draft: Drawing): void; inverse(draft: Drawing): void }[];
}

interface CommandBus {
  execute<T>(cmd: Command<T>): void;
  undo(): void;
  redo(): void;
  undoStep(): void;   // FR-006a: undo last sub-step within an in-progress command
  cancel(): void;     // Esc — discards in-progress command
}
```

## Selection

```ts
interface Selection {
  ids: Set<Id>;
  // Selection is never persisted in Drawing; it lives in the Zustand
  // store and is broadcast to the ARIA live region.
}
```

## Snap

```ts
type SnapMode =
  | "endpoint" | "midpoint" | "center" | "node" | "intersection"
  | "perpendicular" | "tangent" | "nearest" | "parallel" | "grid";

interface SnapCandidate {
  point: Vec2;
  mode: SnapMode;
  strength: "hard" | "soft";  // hard commits on click; soft is advisory
  source: { entityId: Id; ref: EntityPointRef["point"] | { kind: "computed" } };
  distancePx: number;         // distance from cursor in screen pixels
  rank: number;               // 0 = best
}

interface SnapEngine {
  query(cursor: Vec2, modes: Set<SnapMode>): SnapCandidate | null;
  next(): SnapCandidate | null;  // Tab key → cycle to next candidate
}
```

## File format

See `research.md` for the JSON envelope. Key invariants:

- `version` is the only required string at the top level beyond
  `format`. Major version means breaking; minor adds optional fields.
- Unknown top-level keys are preserved in `extra`.
- Unknown entity `kind` values are preserved in `entities` and
  rendered as opaque bounding-box ghosts with a one-time banner.

## Identity, ordering, equality

- All entity and layer ids are ULIDs generated client-side; never
  reuse on undo (a re-added entity has a fresh id).
- Equality of two Drawings is structural after sorting keys and
  ignoring `originOffset` if both rebase to the same canonical origin.
  Round-trip tests use this equality.

## Concurrency model

- One drawing per tab (FR-033).
- Web Locks API holds a single writer lock keyed by file path / OPFS
  handle (FR-032). The lock is the *only* mechanism enforcing
  single-writer; nothing else races.
- Autosave writes to a separate slot (`autosave/<lockKey>`) keyed by
  the same identifier so the user-explicit save is never clobbered.
