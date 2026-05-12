# Feature Specification: 2D Drafting MVP

**Feature Branch**: `claude/web-cad-application-z8xua`

**Created**: 2026-05-12

**Status**: Draft

**Input**: User description: "Build a complete fully functional ACAD on the
web with much better UI. v1 scope: 2D drafting MVP with lines, polylines,
circles, arcs, rectangles, dimensions, layers, snapping, pan/zoom, DXF
import/export, modern UI (command palette, contextual toolbars, dark mode)."

## Clarifications

### Session 2026-05-12

- Q: PDF export — vector or rasterized? → A: Vector PDF by default; entities that cannot be cleanly vectorized are embedded as raster within the same vector PDF page.
- Q: Default unit system on a new drawing? → A: Prompt on first launch with a one-time "What units do you draft in?" dialog defaulting to mm; remember the choice. Units are switchable later and overridable per-drawing and globally.
- Q: Telemetry and privacy stance? → A: Opt-in, anonymous, crash + feature-usage only (stack traces with PII scrubbing; counter-style command/file metrics). Drawing content never leaves the device. **Deferred to post-v1**: v1 ships with zero telemetry. The stance is recorded here so it constrains the eventual implementation.
- Q: Cross-tab unsaved-changes handling? → A: Single-writer lock via the Web Locks API. The first tab to open a file holds the writer lock; a second tab opens the same file read-only and shows a "Take over editing" affordance. Clicking it prompts the original tab to flush or discard pending edits before the lock transfers.
- Q: Multi-document support? → A: One drawing per tab in v1. Opening another file from File > Open opens a new browser tab carrying that file. No in-tab document tabs and no detached windows in v1; both remain candidates for post-v1.
- Q: Selection model — select-first only, or dual? → A: Dual. Commands MAY be invoked with or without a pre-selection. Each command's prompt sequence handles both cases consistently. Trim, hatch, and similar boundary-driven commands explicitly need the post-selection path; pinning select-first only would break them.
- Q: Trim / Extend / Fillet interaction model? → A: Dual mode. (1) Quick mode (default when the user presses Enter at the "Select edges/boundaries" prompt): hover an entity, see the proposed cut or extension in red, click to commit; the cut/extend boundary is the first crossing in cursor direction. (2) Classic mode: the user picks cutting edges or extension boundaries first via single-pick, fence, window, crossing, or area drag, and only those edges constrain the operation. The active mode is shown in the command's persistent state panel.
- Q: Renderer — WebGL2 or WebGPU? → A: WebGPU as the primary renderer; WebGL2 as an automatic fallback for browsers that lack WebGPU at runtime. The scene API and visual output MUST be identical on both. This supersedes the constitution's prior WebGL2-only constraint and is reflected in an updated principle.

## User Scenarios & Testing

### User Story 1 — Draft a simple plan from scratch (Priority: P1)

A user opens the app in a fresh browser tab, picks up a pencil-level
drafting task (e.g., a small floor plan or mechanical part outline), and
draws it using lines, rectangles, circles, and arcs, snapping endpoints to
each other and to a grid. They save the file to disk. They reload the
page, reopen the file, and continue editing. No account, no install, no
network round-trip required.

**Why this priority**: This is the entire reason the product exists. If a
user cannot draw a clean closed shape, save it, and reopen it offline, the
product is not a CAD tool.

**Independent Test**: Open the app, draw a 100×50 rectangle with rounded
30°-arc corners, add a circle inset, save to a local `.modcad` file, hard
reload the tab, reopen the file, and confirm geometry is pixel-identical.

**Acceptance Scenarios**:

1. **Given** an empty drawing, **When** the user invokes the line tool,
   clicks two grid intersections, and presses Escape, **Then** a single
   line segment exists between those exact points and is selected.
2. **Given** a partially drawn rectangle, **When** the user moves the
   cursor near an existing endpoint, **Then** a visible snap marker
   appears at that endpoint and clicking commits to that exact coordinate.
3. **Given** a drawing with mixed geometry, **When** the user presses
   `Ctrl-S` (or `Cmd-S`), **Then** the browser prompts to save a
   `.modcad` file and on confirmation the geometry persists.
4. **Given** a saved `.modcad` file, **When** the user opens it from a
   fresh session, **Then** every primitive is restored with identical
   coordinates, layer, color, and lineweight.
5. **Given** an active command, **When** the user presses Escape, **Then**
   the command cancels without committing partial state.

---

### User Story 2 — Discover and run any command from the keyboard (Priority: P1)

A user who knows AutoCAD muscle memory (`L`, `C`, `REC`, `TR`, `DI`, etc.)
and a user who has never used CAD can both reach every action through a
single discoverable surface: a command palette opened with `Ctrl/Cmd-K`,
fuzzy-searchable, showing the keyboard shortcut alongside each result.
Typing `line` and pressing Enter starts the line tool; typing `L` and
Enter does the same. Pressing `?` lists every binding.

**Why this priority**: A CAD tool lives or dies by its keyboard surface.
The palette is what makes us better than AutoCAD's command line for new
users while preserving expert speed.

**Independent Test**: With no mouse input, open the app, press
`Ctrl/Cmd-K`, type "rec", press Enter, draw a rectangle by typing two
coordinate pairs, escape, and confirm the rectangle exists.

**Acceptance Scenarios**:

1. **Given** the palette is closed, **When** the user presses
   `Ctrl/Cmd-K`, **Then** the palette opens focused on a search input
   within 16 ms.
2. **Given** the palette is open, **When** the user types "rec", **Then**
   the rectangle command and any aliases appear in fuzzy-matched order
   with their default keybinding shown.
3. **Given** an open command, **When** the user types numeric coordinates
   in the format `x,y` (with comma or space), **Then** the next click
   point is fixed to that coordinate.
4. **Given** the user presses `?` from the canvas, **Then** a scrollable
   reference of every command and its current binding appears.

---

### User Story 3 — Organize geometry with layers (Priority: P1)

A user creates layers (e.g., `walls`, `dimensions`, `notes`), assigns each
new entity to a current layer, toggles layer visibility and lock state,
and changes a layer's color/lineweight to update all of its entities at
once. The current layer is always visible in the status bar.

**Why this priority**: Without layers, no real drafting work happens.
This is foundational, not optional.

**Independent Test**: Create three layers, draw entities on each, toggle
one layer off, confirm those entities disappear from the canvas and from
selection; toggle it back, confirm they reappear in their original color.

**Acceptance Scenarios**:

1. **Given** the layer panel is open, **When** the user clicks "New
   layer" and names it, **Then** the layer appears in the list and the
   current layer indicator does not change unless explicitly set.
2. **Given** layer `walls` is set current, **When** the user draws a
   line, **Then** the line's layer is `walls` and it adopts the layer's
   color and lineweight by default.
3. **Given** a layer with entities, **When** the user toggles its
   visibility off, **Then** none of its entities render, none are
   selectable by box-select, and the layer panel shows a hidden state.
4. **Given** a layer is locked, **When** the user attempts to modify any
   entity on it, **Then** the operation is rejected with a non-modal
   notification.

---

### User Story 4 — Snap, dimension, and measure (Priority: P2)

A user enables endpoint, midpoint, intersection, perpendicular, tangent,
and grid snaps from a snap toggle bar. They place an aligned linear
dimension between two endpoints; the dimension's text shows the measured
length in the drawing's units and updates live when the geometry is
moved. They invoke a "Measure" command to read distance, angle, or area
without inserting a dimension.

**Why this priority**: Required for any drawing that communicates intent
to someone other than the author. Dimensions can ship after the core
draw-and-save loop is proven.

**Independent Test**: Draw two lines forming an L, place an aligned
dimension between two endpoints, move one endpoint, and confirm the
dimension text updates within one frame.

**Acceptance Scenarios**:

1. **Given** snap modes endpoint and intersection are enabled, **When**
   the cursor passes within snap radius of an endpoint, **Then** a marker
   appears, the cursor jumps to the exact coordinate, and a hovering
   tooltip labels the snap type.
2. **Given** an aligned dimension command, **When** the user picks two
   points and an offset, **Then** the dimension entity is created on the
   current layer with text reading the measured length to the drawing's
   configured precision.
3. **Given** an existing dimension referencing two endpoints, **When**
   either endpoint moves, **Then** the dimension line, extension lines,
   and text update in the same frame.

---

### User Story 5 — Interoperate with DXF (Priority: P2)

A user imports a DXF file produced by AutoCAD, BricsCAD, or LibreCAD; the
geometry, layers, colors, and lineweights appear correctly. They edit
and export back to DXF; the exported file opens in those other tools
without warnings for the documented supported subset.

**Why this priority**: Without DXF, the app is an island. But the core
draw-and-save loop must work first.

**Independent Test**: Import the canonical DXF test fixture
(`fixtures/sample.dxf`), confirm visual parity with a reference render,
re-export, and diff the exported DXF against the original at the entity
level (allowing for ordering differences).

**Acceptance Scenarios**:

1. **Given** a valid DXF file with LINE, LWPOLYLINE, CIRCLE, ARC, TEXT,
   and DIMENSION entities, **When** the user imports it, **Then** all
   supported entities appear on their original layers with original
   colors and lineweights.
2. **Given** an open drawing, **When** the user exports to DXF, **Then**
   the output is a valid DXF R2018 file readable by AutoCAD and free of
   non-standard extensions.
3. **Given** an unsupported entity in an imported DXF (e.g., 3D solid),
   **Then** the import surfaces a non-blocking warning listing the
   entity types skipped and continues with the rest.

---

### User Story 6 — Modify with confidence (Priority: P2)

A user selects entities by click, shift-click, window, or crossing; they
move, copy, rotate, scale, mirror, trim, extend, offset, and fillet.
Every operation is undoable and re-doable with `Ctrl/Cmd-Z` and
`Ctrl/Cmd-Shift-Z`. A persistent undo history shows the last N actions
with thumbnails or text labels.

**Why this priority**: Drafting is mostly editing, not creating from
scratch. But the editing toolkit can grow incrementally on top of a solid
draw/save base.

**Independent Test**: Draw a rectangle, copy it three times via
copy-and-place, undo all four operations, redo all four, confirm the
final state matches the pre-undo state.

**Acceptance Scenarios**:

1. **Given** a multi-entity selection, **When** the user invokes Move
   and supplies a base point and target point (by click or numeric
   entry), **Then** the selection translates by that exact delta.
2. **Given** any committed operation, **When** the user presses
   `Ctrl/Cmd-Z`, **Then** the drawing returns to the prior state with no
   visual artifacts, and a second press undoes the operation before it.
3. **Given** an undo, **When** the user makes a new committed action,
   **Then** the redo stack is cleared and future redo presses do nothing.

---

### User Story 7 — Work confidently on huge drawings (Priority: P3)

A user opens a drawing with 50,000 visible entities and pans, zooms,
selects, and edits without dropped frames. The status bar shows the
current frame time. A small minimap helps navigation.

**Why this priority**: Differentiator from web competitors that lock up
above 10k entities. Must hold the line on performance, but is not a
day-one MVP requirement.

**Independent Test**: Load the 50k benchmark fixture; pan and zoom for
30 seconds while the perf overlay records frame times; 95th percentile
frame time must be ≤ 16 ms on the baseline hardware.

**Acceptance Scenarios**:

1. **Given** a 50,000-entity drawing on baseline hardware, **When** the
   user pans the view continuously for 5 seconds, **Then** no frame
   exceeds 33 ms and the 95th percentile is at or below 16 ms.
2. **Given** the same drawing, **When** the user box-selects 10,000
   entities, **Then** the selection appears within 200 ms.

---

### Edge Cases

- User loses network mid-edit: app continues to function entirely; no
  feature degrades; on save, file is written locally.
- User opens a `.modcad` file written by a newer version with unknown
  fields: app loads what it understands and shows a banner listing
  preserved-but-not-rendered data. Save round-trips the unknown fields
  unmodified.
- User drags a non-CAD file into the canvas: app rejects with a clear
  message and does not modify the current drawing.
- User holds shift to constrain to ortho while drawing a line very close
  to existing geometry: ortho wins over weak snaps; explicit endpoint
  snaps win over ortho.
- User clicks "Save" while a command is mid-input (e.g., second point of
  a line not yet placed): save commits cleanly; the in-progress command
  state is not saved and the user is told the command was cancelled.
- User undoes past the start of the session after opening a file:
  history is bounded to the post-open session; we do not undo into
  imported state and we say so in the UI.
- User's browser denies the File System Access API: app falls back to
  download/upload, and "Save" becomes "Download a copy" with a clear
  hint.
- Drawing contains entities with coordinates exceeding 1e6 units: app
  warns but loads; precision degradation is documented.
- User opens the same drawing in a second tab while the first holds
  unsaved changes: the second tab opens read-only and shows a "Take
  over editing" button. Clicking it asks the first tab (via a
  cross-tab message) to flush pending edits or discard them; on
  confirmation, the writer lock transfers to the second tab and the
  first becomes read-only. If the first tab is closed or unresponsive,
  the lock can be force-transferred after a short timeout with an
  explicit confirmation.
- User imports a DXF that references missing fonts: text entities render
  in a fallback font with a one-time warning; fallback choice is
  configurable.

## Requirements

### Functional Requirements

#### Drawing primitives
- **FR-001**: Users MUST be able to create line segments, polylines
  (open and closed), rectangles, circles (by center+radius, by 2 points,
  by 3 points), arcs (by center+start+end, by 3 points), ellipses, and
  single-line text.
- **FR-002**: Users MUST be able to enter coordinates numerically during
  any drawing command, in absolute (`x,y`), relative (`@dx,dy`), and
  polar (`@dist<angle`) forms.
- **FR-003**: The application MUST display a cursor preview ("rubber
  band") of the in-progress primitive after the first point is placed
  and before the command commits.

#### Selection and modification
- **FR-004**: Users MUST be able to select entities by single click,
  shift-click (additive), Ctrl-click (toggle), window (left-to-right
  drag, fully-enclosed), crossing (right-to-left drag, any
  intersection), and Select All.
- **FR-005**: Users MUST be able to move, copy, rotate, scale, mirror,
  array (linear and rectangular), trim, extend, offset, and fillet
  selected entities. These commands MUST accept either a pre-selection
  (selection → command) or a post-selection (command → selection
  prompt); the prompt sequence MUST behave identically across both
  paths.
- **FR-005a**: Trim, Extend, Fillet, and Chamfer MUST support two
  interaction modes within a single command invocation:
  (a) **Quick mode** — entered by pressing Enter at the "Select
  cutting edges / boundaries" prompt (or when no pre-selection
  exists). Hovering any entity highlights the proposed cut/extend
  result in red; clicking commits. The implicit boundary is the first
  crossing along the cursor's direction.
  (b) **Classic mode** — entered by picking one or more cutting edges
  or extension boundaries first, via single-pick, fence, window,
  crossing window, or rectangular drag-area selection. Only the chosen
  edges constrain the subsequent operations.
  The command's persistent state panel MUST show which mode is active
  and how to switch.
- **FR-006**: Every committed modification MUST be undoable and redoable
  via `Ctrl/Cmd-Z` and `Ctrl/Cmd-Shift-Z`, with no upper bound on undo
  depth within a session (memory permitting).
- **FR-006a**: Within any multi-step command (polyline vertex picks,
  array setup, etc.), every individual prompt step MUST be undoable
  via `Ctrl/Cmd-Z` or a dedicated "U" sub-option without exiting the
  command. Escape MUST cancel the entire in-progress command without
  committing partial state. Once the command commits, undo operates on
  the whole committed unit.

#### Snapping and constraints
- **FR-007**: The application MUST support these snap types, individually
  toggleable: endpoint, midpoint, center, node, intersection,
  perpendicular, tangent, nearest, parallel, and grid.
- **FR-008**: Snap markers MUST appear within 50 ms of the cursor
  entering a snap zone and disappear within 50 ms of leaving it.
- **FR-008a**: When multiple snap candidates are in range simultaneously,
  the application MUST show **one** marker at a time — the candidate
  predicted from the cursor's recent motion vector — rendered large
  and unambiguous, never a cluster. Pressing `Tab` MUST cycle through
  the other in-range candidates in order of proximity.
- **FR-008b**: An active snap MUST display its measurement inline near
  the cursor: distance from the previous point and angle in the
  drawing's units and precision. Soft snaps (alignment guides,
  extensions) MUST be visually distinct from hard snaps (endpoint,
  intersection); hard snaps commit on click, soft snaps are advisory.
- **FR-009**: Users MUST be able to constrain cursor movement to ortho
  (horizontal/vertical) and polar (configurable angle increments) modes,
  toggled by key (default `F8`, `F10`) or the status bar.

#### Layers
- **FR-010**: Users MUST be able to create, rename, delete, reorder,
  show/hide, lock/unlock, and freeze layers, and to set per-layer color
  and lineweight.
- **FR-011**: Every entity MUST belong to exactly one layer; default
  entity color and lineweight MUST be inherited from the layer ("by
  layer") unless explicitly overridden per entity.
- **FR-012**: Deleting a non-empty layer MUST require confirmation and
  MUST offer to move its entities to another layer rather than discard
  them.

#### Dimensions
- **FR-013**: Users MUST be able to create aligned, linear (horizontal
  and vertical), angular, radial, and diameter dimensions.
- **FR-014**: Dimensions MUST be associative: when the geometry they
  reference moves, the dimension updates within the same frame.
- **FR-015**: The application MUST support unit systems for millimeters,
  centimeters, meters, inches, and feet, with user-configurable
  precision (0–6 decimal places or fractional inches).
- **FR-015a**: On first launch (no prior preference), the application
  MUST present a one-time "What units do you draft in?" modal with
  millimeters preselected. The chosen value MUST persist as the user's
  global default unit for all future new drawings.
- **FR-015b**: The default unit MUST be overridable in two scopes: a
  per-drawing setting that travels with the file, and a per-user
  global default reachable from settings. Changing units never silently
  rescales geometry; coordinates retain their numeric values and only
  their display representation changes.

#### Files and interoperability
- **FR-016**: Users MUST be able to save the current drawing to a
  `.modcad` file, open a `.modcad` file, and create a new empty drawing.
- **FR-017**: The application MUST import DXF files (R2018 and newer)
  preserving lines, polylines, circles, arcs, ellipses, text,
  dimensions, layers, colors, and lineweights.
- **FR-018**: The application MUST export the current drawing to DXF
  R2018, SVG, and PDF. PDF export MUST be vector by default: every
  geometric entity renders as a real PDF path, text as selectable text,
  and layers as PDF optional-content groups. Entity types that cannot
  be cleanly vectorized MUST be embedded as raster regions within the
  same vector PDF page (mixed-mode), with a non-blocking notice listing
  which entities fell back to raster.
- **FR-019**: Unsupported entities or features encountered during DXF
  import MUST produce a non-blocking warning listing the affected
  entity types and counts; import MUST NOT corrupt the rest of the
  drawing.

#### View and navigation
- **FR-020**: Users MUST be able to pan with middle-mouse drag or
  spacebar+drag, zoom with the scroll wheel (cursor-anchored), and fit
  the drawing to the viewport with a single command.
- **FR-021**: The application MUST display a configurable grid; users
  MUST be able to toggle grid visibility and grid snap independently.
- **FR-022**: The application MUST display rulers along the top and left
  edges showing the drawing's units; ruler scale MUST update with zoom.

#### Command surface
- **FR-023**: The application MUST expose a command palette opened via
  `Ctrl/Cmd-K`, fuzzy-searchable, listing every command with its
  current binding.
- **FR-024**: Every command MUST be invokable via a keyboard binding,
  the palette, and (for the common cases) a toolbar or context menu.
- **FR-025**: Keyboard bindings MUST be user-configurable and the
  configuration MUST persist locally.

#### Direct manipulation (grips)
- **FR-025a**: Selected entities MUST expose grips at meaningful points
  (line endpoints/midpoints, polyline vertices, arc endpoints/center,
  circle quadrants/center, dimension definition points, text anchor).
  Dragging a grip MUST modify the entity directly; the operation MUST
  honor active snaps and ortho/polar constraints and MUST be undoable
  like any other commit.
- **FR-025b**: Hovering a grip MUST surface a contextual mini-toolbar
  with operations appropriate to that grip. Minimum v1 surface:
  - Polyline vertex grip: convert segment to arc, convert segment to
    line, add vertex, remove vertex.
  - Arc midpoint grip: change radius, reverse direction.
  - Line endpoint grip: stretch (default — no toolbar needed).
  - Dimension definition-point grip: re-pick definition point,
    flip extension side.
  The toolbar MUST be reachable by keyboard (Alt-key cycles options at
  the active grip).

#### Visual design and accessibility
- **FR-026**: The application MUST support light and dark themes that
  respect the OS preference by default and can be overridden per user.
- **FR-027**: All non-canvas UI MUST meet WCAG 2.2 AA contrast and
  keyboard-operability requirements.
- **FR-028**: Canvas content MUST expose an ARIA live region summarizing
  current selection (count, types) and command state (active prompt).
- **FR-029**: All user-facing strings MUST be externalized for
  localization. English is the only language shipped in v1.

#### Persistence and offline
- **FR-030**: The application MUST function fully offline against local
  files; no v1 feature MUST require a network connection.
- **FR-031**: The application MUST autosave the current drawing to
  browser-local storage at most every 30 seconds while edits are
  pending, and MUST offer to restore on next open if the prior session
  ended without an explicit save.
- **FR-032**: The application MUST enforce a single-writer model per
  open drawing across tabs and windows using the Web Locks API. The
  tab that opens a drawing first holds the writer lock; subsequent
  tabs opening the same drawing MUST present it read-only and offer a
  "Take over editing" affordance. Lock transfer MUST coordinate with
  the holding tab to flush or discard pending edits before releasing
  the lock; if the holder is unresponsive past a short timeout, the
  user MUST be able to force-transfer with an explicit confirmation.
- **FR-033**: Each browser tab MUST host exactly one drawing. The File
  > Open and File > New commands MUST open the target file or new
  drawing in a new browser tab, leaving the originating tab's state
  untouched. In-tab document tabs and detached document windows are
  explicitly out of scope for v1.

### Key Entities

- **Drawing**: A document containing geometry, layers, dimensions,
  block definitions, and metadata (units, precision, name, version).
  Has exactly one current layer at any moment.
- **Layer**: Named container with color, lineweight, visibility, lock,
  and freeze state. Owns zero or more entities.
- **Entity**: A geometric primitive (Line, Polyline, Circle, Arc,
  Ellipse, Text, Dimension, …) with a layer, optional per-entity color
  and lineweight overrides, and primitive-specific geometric attributes.
- **Selection**: An ordered set of entities, derived state from user
  interaction, never persisted across reloads.
- **Command**: A discrete user-invokable action (draw line, trim, set
  layer, etc.) with a name, default binding, optional parameters, and
  an inverse for undo.
- **Snap point**: Transient, derived from entity geometry plus the
  active snap modes; never persisted.
- **Dimension reference**: A binding from a dimension entity to one or
  more points or entities, used to recompute the dimension when the
  referent moves.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A first-time user, given a 30-second introductory video,
  can draw a closed shape made of at least one line, one rectangle, and
  one arc, save it, and reopen it within 5 minutes of opening the app.
- **SC-002**: An experienced AutoCAD user can complete a standard
  benchmark drawing (50 lines, 10 circles, 5 dimensions across 3 layers)
  in the app within 110% of the time it takes them in AutoCAD.
- **SC-003**: With a 50,000-entity drawing on baseline hardware (Intel
  Iris Xe / Apple M1, 16 GB RAM, 1080p), pan and zoom maintain a 95th
  percentile frame time at or below 16 ms over a 30-second session.
- **SC-004**: The DXF round-trip for the canonical fixture preserves
  100% of supported entities exactly; differences are limited to
  documented optional metadata.
- **SC-005**: Cold load (HTML to interactive, no service worker cache)
  is under 2 seconds on a baseline 50 Mbit connection; warm load is
  under 500 ms.
- **SC-006**: Crash rate (defined as an unhandled exception that
  reaches the canvas error boundary) is below 0.1% of sessions as
  measured across the full Playwright e2e suite and a 4-hour dogfood
  session on the 50k-entity benchmark. Production-telemetry-based
  measurement is deferred to a post-v1 release when opt-in telemetry
  ships (see Clarifications, 2026-05-12).
- **SC-007**: Of users who complete the introductory video, 80%
  successfully save a drawing within their first session.
- **SC-008**: Every shipped command has at least one acceptance scenario
  covered by an automated end-to-end test.

## Future Directions (post-v1, recorded so v1 architecture leaves room)

These are deliberately **out of scope for v1** but the v1 data model,
command bus, and renderer MUST not preclude them. They are listed here
so plan.md and future specs inherit the direction.

- **Components, not blocks**: blocks/inserts return as typed-prop
  components (Door, Column, Window) with parametric instances and a
  library browser. Implies the entity model leaves a slot for typed
  instances pointing at a definition with bound parameters.
- **Constraints by default**: dimensions become geometric constraints
  in addition to annotations; locking a dimension drives geometry.
- **Live multiplayer (CRDT)**: cursors, selection sync, comments
  anchored to geometry. Requires the command bus to be serializable
  per-operation, not just per-commit (already the case under FR-006a).
- **Natural-language command input**: an alternate input mode that
  emits the same commands as the palette. Requires command names,
  parameters, and intent to be addressable from outside the UI.
- **Smart components on placement** (a door placed on a wall
  auto-rotates and cuts the opening).
- **Versioned URL references** replacing xrefs.
- **Per-viewport layer overrides and annotative scales** when paper
  space arrives.

## Assumptions

- The v1 target user is a drafter or engineer who already understands
  CAD concepts at the level of an introductory course; the app teaches
  this product, not CAD itself.
- The native unit system is decimal; angles default to decimal degrees
  measured counter-clockwise from east. These defaults are
  user-overridable per drawing.
- DXF support targets R2018 and newer; older AutoCAD releases are best
  effort.
- The 50,000-entity performance target assumes baseline hardware as
  defined in the constitution (Intel Iris Xe / Apple M1, 16 GB RAM).
- Mobile/touch support is out of scope for v1; the layout assumes a
  pointer and a keyboard. Tablet stylus is best effort.
- No user account or cloud sync ships in v1. Local files only.
- No telemetry, analytics, or remote logging ships in v1. The future
  stance (opt-in, anonymous, crash + feature-usage only, drawing
  content never leaves the device) is recorded in Clarifications and
  will be revisited in a post-v1 spec.
- Plot/print fidelity is limited to "what you see on screen at print
  scale"; advanced paper-space layouts are deferred.
- Hatching, blocks/inserts with attributes, table entities, and 3D are
  explicit non-goals for v1; the data model leaves room for them.
- Multi-document workflows in a single tab (a tab strip across the top)
  and detached document windows are out of scope for v1. v1 uses
  one-drawing-per-tab; multi-document UX is a candidate for post-v1.
- Browser support is the latest two stable versions of Chrome, Edge,
  Firefox, and Safari at release time. WebGPU is expected on all four
  in their current stable channels; on older releases that lack
  WebGPU, the WebGL2 fallback renderer takes over automatically.
