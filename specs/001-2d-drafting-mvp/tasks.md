# Tasks: 2D Drafting MVP

**Input**: Design documents from `specs/001-2d-drafting-mvp/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/README.md`

**Tests**: Mandatory per Constitution principle IV. TDD applies to the
geometry kernel, command bus, snap engine, and codecs. UI behavior is
covered by Playwright tests pinned 1:1 to spec acceptance scenarios.

**Organization**: Tasks are grouped by user story so each US can be
implemented and demoed independently behind a feature flag.

## Legend

- `[P]` — can run in parallel with other `[P]` tasks in the same phase
  (different files, no internal dependencies)
- `[US#]` — maps the task to a user story for traceability; `[F]` for
  foundational tasks shared across stories
- File paths reference the structure in `plan.md`

---

## Phase 1: Setup (shared infrastructure)

**Purpose**: stand up the monorepo, tooling, and CI so every later phase
runs against the same gates.

- [ ] **T001** Initialize pnpm workspace at repo root (`package.json`,
      `pnpm-workspace.yaml`, `.npmrc` with `node-linker=isolated`)
- [ ] **T002 [P]** Add `tsconfig.base.json` (strict + noUncheckedIndexedAccess
      + exactOptionalPropertyTypes) and per-package `tsconfig.json`
      stubs in `apps/web` and each `packages/*`
- [ ] **T003 [P]** ESLint config at `tooling/eslint.config.js`
      including `eslint-plugin-boundaries` enforcing
      `contracts/README.md` forbidden imports
- [ ] **T004 [P]** Prettier config at repo root (`.prettierrc`)
- [ ] **T005 [P]** Vitest config at `vitest.config.ts` + per-package
      `vitest.config.ts` extending root
- [ ] **T006 [P]** Playwright config at `apps/web/playwright.config.ts`
      with one project per supported browser
- [ ] **T007 [P]** Tailwind + shadcn/ui init in `apps/web`
      (`tailwind.config.ts`, `components.json`, base `globals.css`)
- [ ] **T008 [P]** `tooling/perf-budget.json` recording the SC-003
      thresholds and per-route bundle budgets
- [ ] **T009** GitHub Actions / CI workflow file at `.github/workflows/ci.yml`
      with jobs: lint, typecheck, unit, integration, e2e, render-parity,
      bench, cold-load, command-coverage. The bench job is a **hard
      merge gate from Phase 2 onward** with a generous initial baseline
      that tightens each phase (constitution Principle II: regressions
      >10% block merge). The only escape is a PR-title token
      `[skip-bench]` which auto-creates a follow-up issue and notifies
      maintainers.
- [ ] **T010 [P]** Pre-commit / lint-staged hook config at repo root
- [ ] **T011 [P]** Add `LICENSE`, `CODEOWNERS`, and a one-line
      contributor note in `README.md` pointing at the spec workflow

**Checkpoint**: `pnpm install && pnpm typecheck && pnpm lint && pnpm test`
all run clean on an empty monorepo.

---

## Phase 2: Foundational (blocks every user story)

**Purpose**: ship the headless engine + renderer abstraction. No user
story may begin until this phase passes its gates.

### Geometry kernel (TDD — write tests first, watch them fail)

- [ ] **T012 [F]** Property tests for `Vec2`, `Mat3` at
      `packages/core/test/property/vec.test.ts` (must fail at start)
- [ ] **T013 [F]** Vendor `mapbox/robust-predicates` (MIT) as
      `packages/core/src/geometry/predicates.ts`
- [ ] **T014 [F]** Property tests for `orient2d`, `inCircle`,
      `segIntersect`, `pointOnSeg` at
      `packages/core/test/property/predicates.test.ts`
- [ ] **T015 [F] [P]** Implement `Vec2.ts`, `Mat3.ts`,
      `Bbox.ts` in `packages/core/src/geometry/`
- [ ] **T016 [F] [P]** Implement primitives: `Line.ts`, `Polyline.ts`,
      `Circle.ts`, `Arc.ts`, `Ellipse.ts` in
      `packages/core/src/geometry/`
- [ ] **T017 [F]** Implement `segIntersect`, `circleIntersect`,
      `arcIntersect`, `offsetCurve` (all using robust predicates)
- [ ] **T018 [F]** Gate: 95% line / 100% branch coverage on
      `predicates.ts`; CI fails below

### Scene / document model

- [ ] **T019 [F]** Tests for `Drawing` construction, layer add/remove,
      entity add/remove at `packages/core/test/integration/scene.test.ts`
- [ ] **T020 [F]** Implement `Drawing`, `Layer`, `Entity` types per
      `data-model.md` in `packages/core/src/scene/`
- [ ] **T021 [F]** Implement origin rebase (`OriginRebaseCommand`) in
      `packages/core/src/scene/originRebase.ts` with property test
      asserting predicate stability after rebase

### Command bus + undo

- [ ] **T022 [F]** Tests for `CommandBus` execute/undo/redo at
      `packages/core/test/integration/commands.test.ts`
- [ ] **T023 [F]** Implement `Command` interface and Immer-backed
      `CommandBus` at `packages/core/src/commands/CommandBus.ts`
- [ ] **T024 [F]** Tests for sub-step undo (FR-006a) at
      `packages/core/test/integration/subStepUndo.test.ts`
- [ ] **T025 [F]** Implement sub-step support in `CommandBus`
- [ ] **T026 [F]** Implement `cancel()` (Esc behavior) and ensure
      no draft state leaks on cancel
- [ ] **T026a [F]** Coverage gate for the command bus: configure
      `vitest` coverage thresholds for `packages/core/src/commands/**`
      at 100% lines + 100% branches in `vitest.config.ts`; CI fails
      below (constitution Principle IV)

### Snap engine

- [ ] **T027 [F]** Tests for predictive single-marker output and `Tab`
      cycling at `packages/core/test/integration/snap.test.ts`
- [ ] **T028 [F]** Implement `SnapEngine` in
      `packages/core/src/snap/SnapEngine.ts` with cursor-motion
      prediction and hard/soft distinction
- [ ] **T029 [F] [P]** Implement individual snap evaluators
      (endpoint, midpoint, center, node, intersection, perpendicular,
      tangent, nearest, parallel, grid) under
      `packages/core/src/snap/modes/*.ts`
- [ ] **T029a [F]** Performance test for snap marker latency at
      `packages/core/test/perf/snap-latency.test.ts`: drive a 10k-event
      synthetic cursor trace and assert marker emission ≤ 50 ms p95
      (FR-008). Wired into the bench CI job as a hard gate.

### Spatial index

- [ ] **T030 [F]** Tests for hit-test and viewport-cull behavior at
      `packages/core/test/integration/index.test.ts`
- [ ] **T031 [F]** Implement two-tier index facade (`flatbush` static
      + `rbush` mutable) in `packages/core/src/index/SpatialIndex.ts`

### View, grid, and chrome

- [ ] **T031a [F]** Pan / cursor-anchored zoom / fit commands in
      `packages/core/src/commands/view/{pan,zoom,fit}.ts`, wired
      through `apps/web/src/canvas/PointerInput.ts` (middle-mouse
      drag, space-drag, scroll-wheel zoom anchored to cursor, fit
      command) (FR-020)
- [ ] **T031b [F]** `GridLayer` in `packages/renderer/src/scene/GridLayer.ts`
      with configurable spacing and adaptive subdivisions; grid
      visibility toggle and grid-snap toggle are independent settings
      in `DrawingSettings.grid` (FR-021)
- [ ] **T031c [F]** `Rulers.tsx` chrome at
      `apps/web/src/canvas/Rulers.tsx` tracking camera zoom and the
      drawing's current units; tick labels respect precision
      (FR-022)

### Renderer abstraction

- [ ] **T032 [F]** Define `Scene` declarative API in
      `packages/renderer/src/api.ts` (`upsert`, `remove`, `camera`,
      `draw`, `pick`, `getStats`)
- [ ] **T033 [F]** WebGPU backend skeleton at
      `packages/renderer/src/webgpu/backend.ts` with adapter request,
      pipeline cache, MSAA 4×
- [ ] **T034 [F]** WebGL2 backend skeleton at
      `packages/renderer/src/webgl2/backend.ts`
- [ ] **T035 [F] [P]** Instanced line pipeline (WebGPU + WebGL2)
- [ ] **T036 [F] [P]** Instanced arc pipeline with analytic AA
      (WebGPU + WebGL2)
- [ ] **T037 [F] [P]** Vertex-shader dash generation from arc-length
      parameter (both backends)
- [ ] **T038 [F]** GPU-side pick pass writing entity IDs to a second
      render target; CPU fallback for browsers that disallow it
- [ ] **T039 [F]** Frame-stats overlay (FPS, drawcalls, entity count)
      behind a debug flag at `packages/renderer/src/debug/`
- [ ] **T040 [F]** Render-parity test: render the canonical
      `benchmarks/scenes/parity.json` with each backend off-screen and
      diff at `packages/renderer/test/parity.test.ts`
- [ ] **T041 [F]** Gate: render-parity test ≤ 0.05% pixel diff

### State store

- [ ] **T042 [F]** Zustand store wiring at
      `apps/web/src/state/store.ts`: holds a `Drawing` reference,
      `Selection`, command-bus state, UI flags. Re-render trigger is
      a version counter bumped by the command bus.

### App shell

- [ ] **T043 [F]** Vite app skeleton in `apps/web` with
      `index.html`, `src/main.tsx`, `src/routes/Boot.tsx`,
      `src/routes/Drawing.tsx`
- [ ] **T044 [F]** `CanvasHost.tsx` mounts the renderer and forwards
      pointer + keyboard input via `PointerInput.ts`
- [ ] **T045 [F]** `StatusBar.tsx` showing coords, units, snap mode,
      scale, fps; `AriaLive.tsx` for selection + command summaries
- [ ] **T046 [F]** First-run `UnitsDialog.tsx` per FR-015a, defaulting
      to mm, persisting to IndexedDB
- [ ] **T046a [F]** i18n wrapper set up at `apps/web/src/i18n/` using
      `@formatjs/intl`: `en.json` message bundle, `<IntlProvider>`
      mounted at app root, message-extraction script in CI, ESLint
      rule banning raw string literals in JSX text and `aria-label`
      attributes. **Every user-facing string must go through this
      wrapper from this task onward** (constitution Principle V "from
      day one"; resolves analyze finding C1)

### Codec scaffolding

- [ ] **T047 [F]** Native `.modcad` reader/writer with gzip via `pako`
      at `packages/codecs/src/modcad/{read,write}.ts`
- [ ] **T048 [F]** Round-trip property test at
      `packages/codecs/test/modcad.test.ts` (random Drawing → write →
      read → structural-equal)

**Checkpoint**: a script-driven smoke test (no UI) can build a
50-entity Drawing, render it through both backends, save to `.modcad`,
reload, and assert byte-equality. CI green on all gates above.

---

## Phase 3: User Story 1 — Draft from scratch (P1) 🎯 MVP

**Goal**: a user opens the app, draws a closed shape using lines, a
rectangle, and an arc with grid + endpoint snap, saves to `.modcad`,
hard-reloads, reopens, and sees identical geometry.

**Independent test**: Playwright `us1-draft-from-scratch.spec.ts`.

### Tests first

- [ ] **T049 [P] [US1]** Playwright `us1-draft-from-scratch.spec.ts`
      at `apps/web/tests/e2e/` covering all 5 acceptance scenarios of
      US1 (must fail at start)
- [ ] **T050 [P] [US1]** Integration test for line/rect/arc
      command factories at `packages/core/test/integration/us1.test.ts`

### Drawing primitives

- [ ] **T051 [US1] [P]** `commands/drawLine.ts` in `packages/core/src`
- [ ] **T052 [US1] [P]** `commands/drawRectangle.ts`
- [ ] **T053 [US1] [P]** `commands/drawCircle.ts` (3 variants:
      center+radius, 2-point, 3-point)
- [ ] **T054 [US1] [P]** `commands/drawArc.ts` (center+start+end and
      3-point)
- [ ] **T055 [US1] [P]** `commands/drawPolyline.ts` (open + closed)
- [ ] **T056 [US1] [P]** `commands/drawEllipse.ts`
- [ ] **T057 [US1]** Numeric coordinate parser (abs `x,y`, rel
      `@dx,dy`, polar `@d<a`) at
      `packages/core/src/commands/parseCoord.ts`
- [ ] **T058 [US1]** Cursor preview ("rubber band") in renderer:
      transient scene-graph items keyed by the current command id

### UI hooks for US1

- [ ] **T059 [US1]** Tool registry + tool activation flow in
      `apps/web/src/canvas/PointerInput.ts`
- [ ] **T060 [US1]** Command state panel (`CommandStatePanel.tsx`)
      showing current step, valid keystrokes, escape behavior
- [ ] **T060a [US1]** Ortho / polar toggles (F8 / F10) at
      `apps/web/src/canvas/OrthoPolar.ts`: state in the store,
      status-bar control surface, cursor-constraint integration with
      the snap engine, configurable polar angle increments persisted
      per drawing (FR-009)
- [ ] **T061 [US1]** File menu wiring: New, Open, Save, Save As via
      File System Access API with download/upload fallback at
      `apps/web/src/files/fsAccess.ts`

**Checkpoint**: US1 e2e green; save/reload round-trip identical.

---

## Phase 4: User Story 2 — Command palette + keyboard (P1)

**Goal**: every action reachable from `Cmd-K` with fuzzy search; the
palette doubles as the legacy command-line bar.

**Independent test**: `us2-command-palette.spec.ts`.

### Tests first

- [ ] **T062 [P] [US2]** Playwright `us2-command-palette.spec.ts`
      covering all US2 acceptance scenarios
- [ ] **T063 [P] [US2]** Unit tests for fuzzy-rank and alias
      resolution at `packages/ui-kit/test/palette.test.ts`

### Implementation

- [ ] **T064 [US2]** Command registry: name, aliases, default
      keybinding, parameters, handler, in
      `packages/core/src/commands/registry.ts`
- [ ] **T065 [US2]** Fuzzy ranker (no external dep beyond `mini-fuzzy`
      or hand-rolled) at `packages/ui-kit/src/Palette/rank.ts`
- [ ] **T066 [US2]** `CommandPalette.tsx` + `CommandLineBar.tsx`
      sharing one input model in `apps/web/src/palette/`
- [ ] **T067 [US2]** Numeric coordinate input inside palette/command
      bar reusing `parseCoord.ts` (T057)
- [ ] **T068 [US2]** Keybinding store + user override UI; persistence
      in IndexedDB; `?` opens the bindings reference
- [ ] **T069 [US2] [P]** ARIA live announcements for palette open,
      result selection, and command activation
- [ ] **T070 [US2] [P]** Default keybinding map covering every v1
      command (matches AutoCAD aliases where unambiguous)

**Checkpoint**: US2 e2e green; user can complete US1 entirely without
the mouse.

---

## Phase 5: User Story 3 — Layers (P1)

**Goal**: full layer panel with create/rename/delete/reorder, show/
hide, lock/unlock, freeze, per-layer color + lineweight; byLayer
inheritance; safe delete with reassignment.

**Independent test**: `us3-layers.spec.ts`.

### Tests first

- [ ] **T071 [P] [US3]** Playwright `us3-layers.spec.ts`
- [ ] **T072 [P] [US3]** Integration test for layer commands at
      `packages/core/test/integration/layers.test.ts`

### Implementation

- [ ] **T073 [US3] [P]** Layer commands: `addLayer`, `renameLayer`,
      `deleteLayer` (with reassign), `setLayerVisible`,
      `setLayerLocked`, `setLayerFrozen`, `setLayerColor`,
      `setLayerLineweight`, `reorderLayer` in
      `packages/core/src/commands/layers/*.ts`
- [ ] **T074 [US3] [P]** Color picker (ACI, true-color, project
      swatches) at `packages/ui-kit/src/ColorPicker/`
- [ ] **T075 [US3]** `LayerTree.tsx` panel in `apps/web/src/panels/`
      with drag-reorder, full-text filter, click-to-highlight
- [ ] **T076 [US3]** `PropertiesPanel.tsx` showing per-entity
      overrides for layer assignment, color, lineweight
- [ ] **T077 [US3]** Renderer: respect layer visible/locked/frozen
      and per-layer color/lineweight resolution (`byLayer` chain)
- [ ] **T077a [US3]** Units settings: Settings → Units pane (global
      default) and Drawing → Properties → Units (per-drawing
      override) at `apps/web/src/settings/UnitsSettings.tsx` and
      `apps/web/src/panels/DrawingProperties.tsx`. Per-drawing
      override is serialized into `.modcad`; global default in
      IndexedDB (FR-015b)

**Checkpoint**: US3 e2e green; locked layer rejects edits with a
non-modal notification.

**Milestone**: P1 MVP shippable behind a feature flag.

---

## Phase 6: User Story 4 — Snap, dimension, measure (P2)

**Goal**: predictive snapping with inline measurement; associative
aligned, linear, angular, radial, diameter dimensions; standalone
measure command.

**Independent test**: `us4-snap-dimension.spec.ts`.

### Tests first

- [ ] **T078 [P] [US4]** Playwright `us4-snap-dimension.spec.ts`
- [ ] **T079 [P] [US4]** Integration test for dimension associativity
      at `packages/core/test/integration/dimensions.test.ts`

### Implementation

- [ ] **T080 [US4]** Snap UI: marker, label, Tab-cycle, soft/hard
      visual distinction in `apps/web/src/canvas/SnapOverlay.tsx`
- [ ] **T081 [US4] [P]** `commands/dimension/aligned.ts`,
      `linearH.ts`, `linearV.ts`, `angular.ts`, `radial.ts`,
      `diameter.ts` in `packages/core/src/commands/dimension/`
- [ ] **T082 [US4]** Associative re-flow on entity move (drives
      dimensions to update in the same frame)
- [ ] **T083 [US4] [P]** Dimension style data: one project-wide style
      with named variants in `packages/core/src/scene/dimensionStyle.ts`
- [ ] **T084 [US4] [P]** `Measure` command (distance, angle, area)
      with on-canvas readout, no persisted entity

**Checkpoint**: US4 e2e green; moving an endpoint visibly updates the
associated dimension in the same frame.

---

## Phase 7: User Story 6 — Modify with confidence (P2)

**Goal**: full modify toolkit with the FR-005a Quick + Classic dual
mode for trim/extend/fillet/chamfer; multi-entity selection by click,
shift-click, window, crossing; grips with contextual mini-toolbar;
infinite undo.

**Independent test**: `us6-modify-with-confidence.spec.ts`.

### Tests first

- [ ] **T085 [P] [US6]** Playwright `us6-modify-with-confidence.spec.ts`
- [ ] **T086 [P] [US6]** Integration tests for trim/extend in both
      Quick and Classic modes at
      `packages/core/test/integration/trimExtend.test.ts`
- [ ] **T087 [P] [US6]** Integration tests for offset, fillet,
      chamfer at `packages/core/test/integration/offsetFillet.test.ts`

### Implementation

- [ ] **T088 [US6] [P]** Selection model: click, shift-click,
      Ctrl-click, window, crossing, select-all, in
      `apps/web/src/canvas/Selection.ts`
- [ ] **T089 [US6] [P]** `commands/modify/move.ts`, `copy.ts`,
      `rotate.ts`, `scale.ts`, `mirror.ts`, `arrayRect.ts`,
      `arrayLinear.ts` in `packages/core/src/commands/modify/`
- [ ] **T090 [US6]** `commands/modify/trim.ts` and `extend.ts` with
      Quick + Classic mode dispatch per FR-005a
- [ ] **T091 [US6] [P]** `commands/modify/offset.ts`, `fillet.ts`,
      `chamfer.ts`
- [ ] **T092 [US6]** Grip rendering + hit-testing in
      `apps/web/src/grips/Grips.tsx`
- [ ] **T093 [US6]** `GripToolbar.tsx` contextual mini-toolbar per
      FR-025b (polyline vertex, arc midpoint, dimension definition
      point); keyboard-reachable
- [ ] **T094 [US6]** History panel surfacing the undo stack with
      labels in `apps/web/src/panels/HistoryPanel.tsx`

**Checkpoint**: US6 e2e green; redo cleared after a new committed
action; per-step undo works mid-polyline.

---

## Phase 8: User Story 5 — DXF / SVG / PDF interop (P2)

**Goal**: import DXF preserving supported entities, layers, colors,
lineweights; export DXF/SVG/PDF round-trip parity.

**Independent test**: `us5-dxf-interop.spec.ts`.

### Tests first

- [ ] **T095 [P] [US5]** Playwright `us5-dxf-interop.spec.ts`
- [ ] **T096 [P] [US5]** DXF read parser unit tests at
      `packages/codecs/test/dxf-read.test.ts` against
      `fixtures/dxf/sample.dxf`
- [ ] **T097 [P] [US5]** DXF round-trip golden test at
      `packages/codecs/test/dxf-roundtrip.test.ts`
- [ ] **T098 [P] [US5]** SVG export snapshot test at
      `packages/codecs/test/svg.test.ts`
- [ ] **T099 [P] [US5]** PDF export unit tests asserting OCG layers,
      embedded subset fonts at `packages/codecs/test/pdf.test.ts`

### Implementation

- [ ] **T100 [US5] [P]** Hand-rolled DXF reader for the spec subset
      (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, TEXT, MTEXT,
      DIMENSION, LAYER, LTYPE) in `packages/codecs/src/dxf/read.ts`
- [ ] **T101 [US5] [P]** DXF writer at `packages/codecs/src/dxf/write.ts`
- [ ] **T102 [US5]** DXF Web Worker wrapper via `comlink` so parsing
      large files doesn't block the main thread
- [ ] **T103 [US5]** Non-blocking warning surface for unsupported
      DXF entities (FR-019) at
      `apps/web/src/notifications/ImportWarnings.tsx`
- [ ] **T104 [US5] [P]** SVG writer at `packages/codecs/src/svg/write.ts`
      with per-layer `<g>`, `data-modcad-id` per entity
- [ ] **T105 [US5] [P]** PDF writer at `packages/codecs/src/pdf/write.ts`
      using `pdf-lib`, OCG layer mapping, font subsetting, vector-
      first with raster fallback hook (FR-018)
- [ ] **T106 [US5]** Export dialog (paper size, scale, layer
      selection) at `apps/web/src/files/ExportDialog.tsx`
- [ ] **T107 [US5]** Missing-font fallback rule (FR Edge Case) with a
      one-time warning

**Checkpoint**: US5 e2e green; round-trip golden fixture diff clean.

---

## Phase 9: Cross-cutting P2 features (autosave, locks, multi-doc)

These are referenced from US1 and US3 acceptance scenarios but
implemented after the core stories so each can be tested in isolation.

- [ ] **T108 [P]** Autosave service (FR-031) at
      `apps/web/src/files/autosave.ts`: 30 s debounce while dirty,
      OPFS-first then IndexedDB fallback
- [ ] **T109 [P]** Restore-on-open prompt at boot route
- [ ] **T110** Web Locks single-writer (FR-032) at
      `apps/web/src/files/locks.ts` with BroadcastChannel fallback
- [ ] **T111** "Take over editing" UI + force-transfer timeout flow
- [ ] **T112** One-drawing-per-tab routing (FR-033): File > Open /
      File > New open in a new tab carrying the file via
      `window.open` and a session handoff handshake
- [ ] **T113 [P]** Cross-tab e2e test at
      `apps/web/tests/e2e/cross-tab-locks.spec.ts`
- [ ] **T113a [P]** Offline-mode verification e2e at
      `apps/web/tests/e2e/offline.spec.ts`: run the US1 acceptance
      scenarios with `page.context().setOffline(true)` from cold
      start; every v1 path must succeed without network (FR-030).
      Hard CI gate.

---

## Phase 10: User Story 7 — Scale to 50k entities (P3)

**Goal**: SC-003 met on baseline hardware (Iris Xe / M1, 1080p): 60
fps pan/zoom on the 50k benchmark; 10k entity box-select ≤ 200 ms.

**Independent test**: `us7-large-drawing.spec.ts` + CI bench gate.

### Tests first

- [ ] **T114 [P] [US7]** Playwright `us7-large-drawing.spec.ts` that
      loads `benchmarks/scenes/50k.json`, runs a 30 s pan/zoom loop,
      and asserts frame-time percentiles
- [ ] **T115 [P] [US7]** Bench CI job hardening — the bench is
      already a hard merge gate from Phase 2 (T009). This task
      finalizes the **50k baseline** at SC-003's targets (≤16 ms p95
      pan/zoom; 10k box-select ≤200 ms) on the canonical hardware
      profile, writes `bench-report.json` artifacts, and tightens
      regression threshold to >10% per constitution Principle II.

### Implementation

- [ ] **T116 [US7]** Tile-based render path for zoom-out: tile cache
      keyed by zoom bucket + dirty regions
- [ ] **T117 [US7] [P]** Off-thread tessellation worker for batch
      arc/ellipse subdivision when the visible set grows
- [ ] **T118 [US7] [P]** Minimap (`apps/web/src/canvas/Minimap.tsx`)
      with click-to-pan
- [ ] **T119 [US7]** Status-bar fps + draw-call surface promoted from
      debug to opt-in user preference
- [ ] **T120 [US7]** Spatial-index rebuild scheduling tuned via the
      bench report (no thrashing during heavy commit chains)

**Checkpoint**: SC-003 met; final bench thresholds locked.

---

## Phase 11: Polish & cross-cutting concerns

- [ ] **T121 [P]** Dark/light theme (FR-026) + OS-preference detection
- [ ] **T122 [P]** i18n maintenance gate: an `i18n-audit` CI job that
      fails on extraction drift (a JSX literal slipped past the ESLint
      rule, or `en.json` is out of sync with extracted messages). The
      wrapper itself ships in T046a; this task is the long-running
      hygiene check.
- [ ] **T123 [P]** WCAG 2.2 AA audit pass on non-canvas UI; remediate
- [ ] **T124 [P]** Documentation: top-level `CONTRIBUTING.md`,
      `docs/architecture.md` summarizing the seam diagram
- [ ] **T125 [P]** README screenshot/GIF set
- [ ] **T126** Bundle-size budget enforcement in CI (per route)
- [ ] **T126a** Cold/warm load gate: Playwright + Lighthouse spec at
      `apps/web/tests/e2e/load-perf.spec.ts` asserting cold load
      HTML→interactive ≤ 2 s on a 50 Mbit throttled profile and warm
      load ≤ 500 ms once the service-worker cache is primed (SC-005).
      Hard CI fail on regression.
- [ ] **T127** Run `quickstart.md` end-to-end on a clean clone as a
      release-readiness check
- [ ] **T127a** Command-coverage enforcement at
      `tooling/check-command-coverage.ts`: enumerate registered
      commands from the `CommandRegistry`, assert at least one
      Playwright spec references each command's canonical name, fail
      the build on drift (SC-008).

---

## Dependencies & execution order

### Phase dependencies

- **Phase 1 (Setup)**: no deps
- **Phase 2 (Foundational)**: depends on Phase 1; blocks every US
- **Phase 3 (US1)**: depends on Phase 2
- **Phase 4 (US2)**: depends on Phase 2; integrates with US1 but tests
  independently via the palette-only path
- **Phase 5 (US3)**: depends on Phase 2; layers are referenced by
  every later story but each later story works on a default layer
- **Phase 6 (US4)**: depends on Phase 2 + US1 (needs at least one
  drawing primitive); US3 is helpful but not required
- **Phase 7 (US6)**: depends on Phase 2 + US1
- **Phase 8 (US5)**: depends on Phase 2; produces self-contained
  codecs; can run in parallel with Phases 6 and 7
- **Phase 9 (Locks/Autosave/Multi-doc)**: depends on Phase 2 + US1
- **Phase 10 (US7)**: depends on Phases 3–8 substantially landed
- **Phase 11 (Polish)**: depends on the user stories targeted in
  the release

### Within each user story

- Tests are written first and MUST FAIL before implementation
  (constitution IV).
- Engine commands precede UI wiring; UI wiring precedes Playwright
  green.
- Each user story ends with `pnpm test:e2e -- us<n>-*` green and the
  story's checkpoint observed by hand.

### Parallel opportunities

- All `[P]` tasks within a phase can run concurrently.
- Phases 6, 7, 8 can run in parallel after Phase 5 lands, given
  multiple developers — they share Phase 2 but touch different
  command/codec surfaces.
- Within Phase 2 the geometry kernel (T012–T018), scene model
  (T019–T021), command bus (T022–T026), snap (T027–T029), spatial
  index (T030–T031), and renderer (T032–T041) are mostly
  independent and parallelizable.

---

## Implementation strategy

### MVP path (single developer)

1. Phase 1 (Setup)
2. Phase 2 (Foundational) — kernel + renderer + scaffolding
3. Phase 3 (US1) → demo: draw, save, reload
4. Phase 4 (US2) → demo: keyboard-only US1
5. Phase 5 (US3) → demo: layered drawing
6. **Cut a v0.1 internal release**
7. Phase 6 (US4) → dimensions
8. Phase 7 (US6) → modify
9. Phase 8 (US5) → DXF/SVG/PDF
10. Phase 9 (cross-cutting)
11. Phase 10 (US7) → perf hardening
12. Phase 11 (Polish) → **v1.0**

### Parallel team (3 devs after Phase 2)

- Dev A: Phases 3 → 4 → 7 (commands + palette + modify)
- Dev B: Phases 5 → 6 (layers + dimensions)
- Dev C: Phase 8 → Phase 10 (codecs + perf)
- All converge for Phase 9 + 11

---

## Notes

- Per the constitution, the geometry kernel and command bus are TDD
  with non-negotiable coverage gates; UI tests are pinned 1:1 to spec
  acceptance scenarios.
- `[P]` is a *can*, not a *must*. Tasks may be serialized at the
  implementer's discretion.
- Each task should map to a single commit or a small commit cluster;
  the commit message references the task ID.
- The render-parity gate (T041) is a hard merge block — any change
  touching shaders or geometry pipelines reruns it.
- The perf bench (T115) is a soft gate (warn) until Phase 10
  promotes it to a hard fail.
