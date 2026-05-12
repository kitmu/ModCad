# Implementation Plan: 2D Drafting MVP

**Branch**: `claude/web-cad-application-z8xua`

**Date**: 2026-05-12

**Spec**: [spec.md](./spec.md) · **Constitution**: [../../.specify/memory/constitution.md](../../.specify/memory/constitution.md) (v0.2.0)

**Input**: Feature specification from `specs/001-2d-drafting-mvp/spec.md`

## Summary

Ship a browser-native, offline-first 2D drafting tool. The UI is a Vite +
React + Tailwind shell whose centerpiece is a WebGPU-rendered (with
WebGL2 fallback) drawing surface driven by a headless CAD engine
(geometry kernel + entity model + command bus + snap engine + undo). The
engine is pure TypeScript, framework-agnostic, and the only thing the UI
talks to. DXF, SVG, and PDF interop sit behind small codec modules that
consume engine types in and produce engine types or byte streams out.

The plan splits work into 5 phases, each independently shippable behind
a feature flag, mapped to the prioritized user stories in the spec.

## Technical Context

**Language/Version**: TypeScript 5.4+ in `--strict` mode with
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and
`noFallthroughCasesInSwitch` on. Node 20 LTS for tooling.

**Primary Dependencies**:
- React 18.3+ (function components only)
- Zustand 4.x for app state
- Tailwind CSS 3.x + shadcn/ui primitives
- Vite 5.x build
- Vitest 1.x (unit) + Playwright 1.45+ (e2e)
- `@webgpu/types` and `@types/webgl2` for renderer typing
- `flatbush` (immutable static spatial index) for hit-testing and
  viewport culling; `rbush` (dynamic R-tree) for the editable scene
- `pdf-lib` for vector PDF assembly
- `pako` for gzip (`.modcad` files)
- `comlink` for Web-Worker IPC (DXF parse, hatch boundary, file I/O)

**Storage**:
- Local-first. `.modcad` files via the File System Access API on
  Chromium/Edge; download/upload fallback elsewhere.
- IndexedDB (via a tiny wrapper, no Dexie unless a second consumer
  appears) for autosave snapshots, user preferences, and the recent-
  files list.
- OPFS for large session caches (DXF parse trees on huge files).
- No server-side storage in v1.

**Testing**:
- Unit: Vitest, colocated `*.test.ts` next to source.
- Property: `fast-check` for geometry predicates and codec round-trips.
- Integration: Vitest with a JSDOM-free node environment, exercising
  the core engine end-to-end without React.
- E2E: Playwright against the built app, one test per spec acceptance
  scenario.
- Perf: a custom Vitest reporter wraps a benchmark scene; CI gate
  fails if frame-time 95p regresses >10% from baseline.

**Target Platform**: Latest two stable versions of Chrome, Edge,
Firefox, Safari. WebGPU primary on all; WebGL2 fallback wired in CI.
Pointer + keyboard required; touch/stylus best effort.

**Project Type**: Monorepo (pnpm workspaces) — one app, several
packages.

**Performance Goals**: per constitution and SC-003 — 60 fps with 50k
visible line segments and 10k visible labels at 1080p on Iris Xe / M1,
16 GB RAM. Cold load <2 s on 50 Mbit, warm load <500 ms. 95p frame
time ≤ 16 ms during pan/zoom on the 50k benchmark.

**Constraints**: offline-capable; no PII leaves the device; bundled
runtime ≤ 600 KB gzip for the initial route (kernel + renderer + UI
shell); codecs lazy-loaded; numeric stability bounded across a 1e6
unit working area with local-origin rebase past that.

**Scale/Scope**: a v1 release supporting drawings up to ~200k entities
in memory, ~50k visible on screen at any one time. ~70 user-invokable
commands at v1.

## Constitution Check

*GATE: must pass before Phase 1 design. Re-checked after each phase.*

| Principle | Status | Notes |
|---|---|---|
| I. Drawing Fidelity | **PASS** | Single command bus; reversible ops; codec round-trip tests in CI; robust predicates from a vetted library or our own hand-rolled set (Shewchuk-style adaptive precision) gated by property tests. |
| II. Performance is a Feature | **PASS** | Spatial index (flatbush+rbush dual), WebGPU instancing, Web Workers for codecs/booleans, deterministic CI bench. |
| III. Spec-Driven Development | **PASS** | This plan follows the merged spec; subsequent features will follow the same pipeline. |
| IV. Tests Before Tactics | **PASS** | Geometry kernel and command bus are TDD; UI behaviors mapped 1:1 to Playwright scenarios. |
| V. Accessible, Keyboard-First | **PASS** | Palette (Cmd+K) + per-action binding + mouse path required by every command. WCAG AA on non-canvas UI. Canvas ARIA live region planned. i18n wrapper from day one. |
| VI. Offline-First, Cloud-Optional | **PASS** | No network required for any v1 feature. Telemetry deferred (spec clarif. Q3). |
| VII. Boring, Composable Architecture | **PASS** | One store, one command bus, one renderer-abstraction. Renderer abstraction has *two* backends, and the constitution explicitly requires that. |

**No violations to track in Complexity Tracking.**

## Project Structure

### Documentation (this feature)

```text
specs/001-2d-drafting-mvp/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 — open questions & resolutions
├── data-model.md        # Phase 1 — entity/document model
├── quickstart.md        # Phase 1 — local dev / first run
├── contracts/           # Phase 1 — typed contracts at package seams
│   └── README.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — produced by /speckit.tasks
```

### Source code (repository root)

```text
apps/
└── web/                          # Vite + React app
    ├── index.html
    ├── src/
    │   ├── main.tsx
    │   ├── routes/
    │   │   ├── Drawing.tsx       # the one drawing route (one per tab)
    │   │   └── Boot.tsx          # cold-start file picker / restore prompt
    │   ├── canvas/
    │   │   ├── CanvasHost.tsx    # mounts the renderer surface
    │   │   ├── PointerInput.ts   # pointer/keyboard → command bus events
    │   │   └── AriaLive.tsx      # selection/command live region
    │   ├── panels/
    │   │   ├── LayerTree.tsx
    │   │   ├── PropertiesPanel.tsx
    │   │   ├── HistoryPanel.tsx
    │   │   └── ReferencesPanel.tsx   # stub for future xrefs
    │   ├── palette/
    │   │   ├── CommandPalette.tsx    # Cmd+K
    │   │   └── CommandLineBar.tsx    # legacy CAD command line, same engine
    │   ├── command-state/
    │   │   └── CommandStatePanel.tsx # persistent step/prompt panel
    │   ├── status/
    │   │   ├── StatusBar.tsx         # coords, units, snap mode, scale, fps
    │   │   └── UnitsDialog.tsx       # first-run units prompt (FR-015a)
    │   ├── grips/
    │   │   └── GripToolbar.tsx       # contextual mini-toolbar (FR-025b)
    │   ├── settings/
    │   ├── i18n/                     # English bundle + extraction tooling
    │   └── styles/
    └── tests/
        └── e2e/                  # Playwright specs, one per acceptance scenario

packages/
├── core/                         # the headless CAD engine
│   ├── src/
│   │   ├── geometry/             # primitives, predicates, ops (pure)
│   │   ├── scene/                # Drawing, Layer, Entity, transforms
│   │   ├── commands/             # CommandBus, Command, UndoStack
│   │   ├── snap/                 # SnapEngine, modes, predictor
│   │   ├── index/                # spatial index facade (flatbush+rbush)
│   │   ├── ids.ts                # ULID/uuid helpers, never leak DB ids
│   │   └── index.ts
│   └── test/
│       ├── property/             # fast-check predicates
│       └── integration/          # headless command-bus scenarios
├── renderer/
│   ├── src/
│   │   ├── api.ts                # backend-agnostic scene-graph API
│   │   ├── webgpu/               # primary backend
│   │   ├── webgl2/               # fallback backend
│   │   ├── pick.ts               # GPU-buffer hit-test + CPU fallback
│   │   └── debug/                # frame-stats overlay
│   └── test/
├── codecs/
│   ├── dxf/
│   │   ├── read.ts
│   │   ├── write.ts
│   │   └── fixtures/
│   ├── svg/
│   ├── pdf/                      # vector-first w/ raster fallback (FR-018)
│   ├── modcad/                   # native format (JSON+gzip)
│   └── test/
└── ui-kit/                       # shadcn-based ModCad-specific primitives
    └── src/
        ├── Palette/              # used by both CommandPalette and CommandLineBar
        ├── MiniToolbar/
        └── Tooltip/

benchmarks/
├── scenes/                       # 50k.json, 200k.json, mech-part.json
└── run.ts                        # invoked from CI

fixtures/
├── dxf/                          # canonical DXF for round-trip tests
└── modcad/

tooling/
├── eslint.config.js
├── tsconfig.base.json
└── perf-budget.json              # source of truth for budgets
```

**Structure Decision**: pnpm monorepo. `packages/core` is the only
mandatory dependency of the renderer and the codecs; the UI depends on
all three. The split exists because (a) the core is reusable headless
(future CLI, batch operations, server-side render) and (b) the
renderer's two backends share an API. We will not pre-split `core`
into geometry/scene/commands/snap until a second external consumer
appears (constitution VII).

## Phased delivery

Each phase ends with a green CI, the e2e tests for its user stories
passing, and the perf bench within budget. Phases ship behind feature
flags so we can dogfood progressively.

### Phase 0 — Research and risk burndown (week 0–1)

Output: [`research.md`](./research.md). Resolve:
- Robust geometry predicate strategy (Shewchuk port vs. existing
  library vs. interval arithmetic).
- DXF: hand-rolled R2018 subset vs. wrap `libredwg-web` (LGPL caveats)
  vs. `dxf-parser` (read-only, MIT) plus a custom writer.
- Text rendering: HarfBuzz-WASM vs. system-font measurement via
  Canvas2D vs. an SDF atlas of bundled fonts. Affects FR-013, FR-029
  (i18n), and the DXF font fallback edge case.
- Spatial index for editable scenes that mutate per click: rbush vs.
  custom kd-tree.
- WebGPU shader portability with the WebGL2 fallback — identical
  output requires matching MSAA, line caps, line joins, and dashed-
  line generation; we'll write a "renderer parity" e2e fixture.

### Phase 1 — Engine and renderer foundation (weeks 1–4)

Deliverables, in order, each TDD:

1. `packages/core/geometry` — `Vec2`, `Mat3`, `Line`, `Polyline`,
   `Circle`, `Arc`, `Ellipse`, `Bbox`. Predicates: `orient2d`,
   `inCircle`, `segIntersect`, `pointOnSeg`. Property-tested with
   `fast-check`. Coverage gate: 95% line, 100% branch on predicates.
2. `packages/core/scene` — `Drawing`, `Layer`, `Entity` discriminated
   union with versioned schema. Each entity carries `id`, `layerId`,
   `color: "byLayer" | RGBA`, `lineweight: "byLayer" | number`,
   geometry. Drawing owns the layer list and entity dictionary;
   selection is *not* persisted in the drawing.
3. `packages/core/commands` — `Command = { name, params, apply(draft),
   inverse(draft) }` over an Immer-like draft with structural sharing.
   `CommandBus.execute(cmd)` pushes to the undo stack. Per-step support
   via `Command.subStep(step)` for FR-006a.
4. `packages/core/snap` — `SnapEngine.query(point, modes, dwellMs)`
   returns at most one ranked candidate per FR-008a; alternates
   surfaced via `next()`. Soft vs hard distinction encoded in the
   candidate type.
5. `packages/core/index` — wraps `flatbush` (immutable, rebuilt on
   commit) for view culling and `rbush` (mutable) for in-command
   incremental hit-testing.
6. `packages/renderer/api.ts` — a small declarative scene-graph API:
   `Scene.upsert(entities)`, `Scene.remove(ids)`, `Scene.camera({})`,
   `Scene.draw()`. No imperative WebGPU bleed-through.
7. `packages/renderer/webgpu` — primary backend, instanced lines and
   arcs, MSAA 4x, depth-free 2D pipeline, GPU-side picking via a
   second render target with entity IDs.
8. `packages/renderer/webgl2` — fallback backend with byte-identical
   output for the canonical render-parity fixture.

Gate: a "no-UI smoke" test that drives the engine from a script,
renders the 50k scene off-screen, and asserts pixel parity between the
two backends within a documented tolerance (≤1 channel on ≤0.05% of
pixels). Perf budget must be in CI before Phase 2 starts.

### Phase 2 — User Stories 1, 2, 3 (weeks 4–8) — P1 features

Builds the user-visible MVP atop the engine.

- **Drawing primitives** (FR-001/2/3): Line, Polyline (open + closed),
  Rectangle, Circle (3 variants), Arc (2 variants), Ellipse, Text.
  Numeric coordinate input with absolute / relative / polar forms.
- **Selection and modify** (FR-004/5/6/6a): Move, Copy, Rotate, Scale,
  Mirror, Trim, Extend, Offset, Fillet — with the Quick + Classic
  dual mode for Trim/Extend/Fillet/Chamfer (FR-005a). Per-step undo
  inside the command (FR-006a). Esc cancels.
- **Snapping & constraints** (FR-007/8/8a/8b/9): predictive single
  marker, Tab to cycle, inline distance/angle, ortho/polar toggles.
- **Layers** (FR-010/11/12): tree (flat for v1, hierarchy slot
  reserved), per-layer color & lineweight, byLayer inheritance,
  visibility/lock, safe delete with reassignment.
- **Command surface** (FR-023/24/25): Cmd+K palette doubling as the
  legacy command-line bar (single text input, dual entry points);
  every command bindable; user-configurable bindings persisted to
  IndexedDB.
- **Direct manipulation** (FR-025a/b): grips with contextual
  mini-toolbar; keyboard cycle via Alt+arrow at active grip.
- **View & navigation** (FR-020/21/22): pan, zoom (cursor-anchored),
  fit, grid, rulers.
- **Units & first-run prompt** (FR-015a/b).
- **Visual design & a11y** (FR-026/27/28/29): dark/light, OS-pref,
  WCAG AA, ARIA live region, i18n wrapper.

Gate: User Stories 1, 2, 3 e2e green.

### Phase 3 — User Stories 4, 6 (weeks 8–11) — P2 features

- **Dimensions** (FR-013/14): associative aligned, linear (H/V),
  angular, radial, diameter. One project-wide style with named
  variants. Re-flow on referent move within the same frame.
- **Modify expansion**: Array (linear, rectangular; polar is P3),
  Mirror, Chamfer (with the FR-005a dual mode).
- **Cross-tab single-writer lock** (FR-032) via Web Locks API.
- **Multi-document** (FR-033): File > Open / File > New always open
  in a new browser tab; same-file open in a second tab → read-only +
  Take-over flow.
- **Autosave** (FR-031): 30 s debounce while dirty, write to OPFS or
  IndexedDB. Restore prompt on next open.

Gate: User Stories 4 + 6 e2e green.

### Phase 4 — User Story 5 (weeks 11–14) — DXF / SVG / PDF

- **Native `.modcad`** writer/reader (gzipped JSON) with forward-
  compatibility (unknown-field round-trip).
- **DXF R2018** import: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC,
  ELLIPSE, TEXT, MTEXT, DIMENSION subset; LAYER table; LTYPE table
  for lineweights; unsupported entities surfaced as a single
  non-blocking warning batch with counts (FR-019).
- **DXF R2018** export: round-trip parity for the canonical fixture
  per SC-004; written to a versioned `fixtures/dxf/golden/` dir.
- **SVG** export: one `<g>` per layer, `data-modcad-id` per entity,
  PDF-friendly stroke widths in user units, viewBox in drawing units.
- **PDF** export per FR-018: vector by default using `pdf-lib`, paths
  per entity, layers as PDF optional-content groups, text as real
  text (with font subsetting); per-entity raster fallback for any
  entity type that cannot be cleanly vectorized (none in v1, but the
  path exists for future raster image inserts). User-selectable paper
  size and scale.

Gate: User Story 5 e2e + DXF round-trip golden test green.

### Phase 5 — User Story 7 (weeks 14–16) — scale to 50k

Performance hardening: bench-driven changes only — instancing improvements,
spatial-index rebuild scheduling, off-thread tessellation, minimap, perf
overlay surfaces SC-003 metrics live in the status bar.

Gate: SC-003 met on baseline hardware in CI's perf job.

## Constitution Check (re-confirmed post-phasing)

No new violations. The phasing keeps the command bus and renderer as
single canonical implementations; codecs sit behind one facade each.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebGPU shader behavior differs from WebGL2 fallback in edge cases (line caps, MSAA seams) | M | H | Render-parity e2e fixture in CI from Phase 1 day one. |
| DXF entity coverage scope-creeps | H | M | Hard list in plan; everything outside is the FR-019 non-blocking warning batch. |
| Float precision degrades past 1e6 units | M | H | Local-origin rebase per drawing; rebase on pan when the origin distance exceeds 5×10^5 units. Property test asserts predicate stability post-rebase. |
| `pdf-lib` cannot do PDF OCG layers cleanly | L | M | Already validated in research.md; fallback is to emit PDF without layer groups and warn. |
| Web Locks API absent on older browsers in scope | L | M | Detected at startup; on absence, fall back to BroadcastChannel coordination with a longer timeout. |
| Spatial index rebuild thrashes during heavy edit | M | M | Two-tier index (immutable flatbush for the view, mutable rbush for the in-command edit set); commit triggers a single rebuild. |

## Complexity Tracking

No constitution violations to justify. The renderer's two backends are
required by the constitution and counted as a single canonical
abstraction.
