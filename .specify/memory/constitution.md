# ModCad Constitution

ModCad is a browser-native CAD application aiming to deliver the power of
established 2D drafting tools (AutoCAD, BricsCAD) with a modern, opinionated
user experience: keyboard-first command palette, contextual toolbars,
infinite undo, real-time multi-user, dark mode, and zero install.

This constitution governs every spec, plan, and implementation decision in
the repository. Where it conflicts with personal preference or expediency,
the constitution wins. Amendments require a PR that updates this file and
notes the rationale.

## Core Principles

### I. Drawing Fidelity is Non-Negotiable

Geometric primitives are the contract. Any operation that mutates geometry
MUST be:

- **Numerically stable**: snapping, intersections, and offsets use robust
  predicates (Shewchuk-style adaptive precision, never bare IEEE-754 for
  orientation tests). Drawings operate in a documented three-tier
  precision regime:
  - **Tier A — `[0, 10⁶]` units from the drawing's local origin**: full
    double-precision, all predicates exact, snap radius unbounded.
  - **Tier B — `(10⁶, 10⁹]` units**: precision degrades proportionally;
    snap radius and minimum feature size documented per tier.
  - **Tier C — `> 10⁹` units**: warn at load, refuse new geometry past
    the limit.
  Origin rebase is automatic when the active viewport center wanders
  past tier-A's safe zone; the rebase is invisible to user-facing
  coordinates.
- **Reversible**: every mutation goes through a single command bus that
  emits inverse operations into the undo stack. No silent side effects.
- **Lossless on round-trip**: import → export of supported formats (DXF
  v1, SVG v1) preserves layer, color, lineweight, and geometry exactly for
  the subset we document as supported.

A bug that corrupts a drawing is a P0. A bug that produces a wrong pixel
on screen is a P1.

### II. Performance is a Feature, Not a Polish Item

The drawing surface MUST sustain 60 fps under the following baseline at
1080p on a 2020-era laptop GPU (Intel Iris Xe / M1):

- 50,000 line segments visible
- 10,000 visible text labels
- Pan, zoom, and selection feedback without dropped frames

Performance budgets are enforced in CI via a deterministic benchmark
scene. Regressions >10% block merge. WebGPU is the primary renderer;
WebGL2 is the automatic fallback when WebGPU is unavailable at runtime.
The scene API MUST achieve **visual parity within a documented per-pixel
tolerance on canonical scenes** between the two backends, plus a
**published feature-parity matrix** listing any compute-only features
that degrade or disable on WebGL2 (e.g., GPU-side hatch flood fill,
parallel spatial-index build). Pixel-identity is not a CI gate; tolerated
diff is gated. Canvas2D is only allowed for UI chrome and overlays.

### III. Spec-Driven Development (NON-NEGOTIABLE)

Every feature follows the spec-kit workflow, in order:
`/speckit.specify` → `/speckit.clarify` (when ambiguous) →
`/speckit.plan` → `/speckit.tasks` → `/speckit.implement`.

- No implementation PR without a merged `spec.md` and `plan.md` for that
  feature directory.
- Specs describe **what** and **why**, never **how**. Tech choices live in
  plans.
- The spec is the source of truth for acceptance criteria; PRs that pass
  CI but fail spec acceptance are rejected.

### IV. Tests Before Tactics

The core geometry kernel, command bus, and serialization layer are TDD —
red, green, refactor. Tests precede implementation, are reviewed by a
human, and MUST fail before code is written.

UI behavior is covered by Playwright end-to-end tests pinned to the spec's
acceptance scenarios. Visual regressions are caught by deterministic
screenshot diffs of canonical scenes.

Coverage targets:
- Geometry kernel: 95% line, 100% branch on robust predicates.
- Command bus / undo: 100% command-level integration coverage.
- UI: every acceptance scenario in every shipped spec has at least one
  Playwright test.

### V. Accessible, Keyboard-First, Localizable

CAD is a keyboard discipline. Every action MUST be reachable via:

1. A discoverable command palette (`Ctrl/Cmd-K`).
2. A configurable keyboard binding (default + user override).
3. A mouse path (toolbar or context menu) for discoverability.

WCAG 2.2 AA is the floor for non-canvas UI. Canvas content exposes an ARIA
live region summarizing the current selection and command state. All
user-facing strings are wrapped for i18n from day one; English ships
first, but no string is hard-coded.

### VI. Offline-First, Cloud-Optional

The app MUST be fully functional offline against a local file: open, edit,
save (File System Access API where available; download fallback
otherwise). Cloud sync, collaboration, and accounts are additive features
that gracefully degrade. A user who never signs in MUST never see a
locked feature in the v1 scope.

### VII. Boring, Composable Architecture

- One state store, one command bus, one renderer. No competing patterns.
- New abstractions justify themselves with at least two real callers.
- No premature plugin systems. We ship features; we extract plugin
  surfaces when a third caller appears.
- Third-party dependencies require a one-line justification in the plan
  and a license check.

## Technology Constraints

- **Language**: TypeScript (strict mode, `noUncheckedIndexedAccess` on).
- **UI**: React 18+ with function components and hooks. State via Zustand.
- **Renderer**: WebGPU primary, WebGL2 fallback. Both sit behind a
  single thin scene-graph wrapper so the rest of the app does not
  branch on backend. The WebGL2 fallback path is exercised in CI on
  every PR.
- **Line rendering**: instanced extruded quads with miter/round/bevel
  joins and butt/round/square caps; analytic distance-field
  anti-aliasing in the fragment shader. Picking shares the same
  geometry. Native fat-line primitives are NOT used on either backend
  (they don't exist on WebGPU/WebGL2).
- **Color**: working space is sRGB. All exports (PDF, PNG, SVG) MUST
  be tagged sRGB. P3 / wide-gamut deferred.
- **Input**: PointerEvents only. No separate mouse/touch handlers.
  Pen and tablet input flow through the same surface.
- **Build**: Vite. Node 20+ for tooling.
- **Styling**: Tailwind CSS + shadcn/ui primitives. No CSS-in-JS runtime.
- **Geometry**: hand-rolled kernel in `packages/core/geometry/`.
  Shewchuk-style adaptive-precision predicates (`orient2d`, `inCircle`,
  `segIntersect`) live in pure TS inside the kernel and are called
  directly with zero FFI overhead — they are the foundation everything
  else builds on. Polygon booleans, offsetting, and clipping use
  Clipper2-WASM behind our own facade; the facade is the API surface
  the rest of the app sees. `martinez` and `polygon-clipping` are
  rejected — both have well-known robustness issues on degenerate
  inputs.
- **File formats**: DXF (hand-rolled R2018 subset), SVG, PDF export via
  `pdf-lib` (browser-side; PDFKit-the-Node-library is unsuitable
  without polyfills). Native format is `.modcad` (JSON, gzipped) in
  v1; a binary variant (CBOR or MessagePack) is on the v2 roadmap.
- **Persistence**: IndexedDB for local; optional Postgres + S3 for cloud.
- **Tests**: Vitest (unit), Playwright (e2e), bench script in CI.

Browsers supported: latest two versions of Chrome, Edge, Firefox, Safari.

## Development Workflow

1. Open or pick up an issue. Confirm scope with the requestor.
2. Run `/speckit.specify` to produce `specs/NNN-<slug>/spec.md`.
3. If `[NEEDS CLARIFICATION]` markers remain, run `/speckit.clarify`.
4. Run `/speckit.plan` with the chosen tech approach.
5. Run `/speckit.tasks` to produce an ordered, parallelizable task list.
6. Implement via `/speckit.implement` (or by hand, following the tasks).
7. PR must include: link to spec, plan, tasks; passing CI (unit, e2e,
   bench, type-check, lint); two approving reviews for changes to the
   geometry kernel or command bus; one for everything else.
8. Squash merge to `main`. Release notes are auto-generated from PR titles
   under a curated `## Highlights` block per release.

Quality gates blocking merge:
- TypeScript `--strict` clean.
- ESLint clean (no `// eslint-disable` without a justification comment).
- Unit + e2e tests pass.
- Performance benchmark within budget.
- Bundle size budget per route (documented in plan.md when relevant).

## Governance

This constitution supersedes ad-hoc decisions. When code, spec, or PR
review conflicts with a principle, the principle wins or the principle is
amended in the same PR.

- **Amendments** require: rationale section in the PR description,
  approval from at least one maintainer, and a corresponding bump to the
  version below per semver (MAJOR for principle removal or redefinition,
  MINOR for new principle or section, PATCH for clarifications).
- **Exceptions** are allowed but logged: a comment in the relevant file
  citing the principle and the reason, plus an issue tagged
  `constitution-exception`.
- **Review cadence**: revisit quarterly. Drop principles that are no
  longer enforced. Tighten principles that have produced bugs.

**Version**: 0.2.1 | **Ratified**: 2026-05-12 | **Last Amended**: 2026-05-13

<!-- 0.2.0: Renderer changed from "WebGL2 default" to "WebGPU primary,
WebGL2 fallback" following external CAD-architecture consultation.
MINOR bump because the change adds a new compatibility constraint (the
fallback path) rather than redefining a principle.

0.2.1 (2026-05-13): PATCH bump for clarifications and tech-stack fixes
flagged in a second consultation:
- Principle I expanded with the explicit 3-tier precision regime
  (10⁶ / 10⁹ / >10⁹) replacing the bare "1e6 working area" phrasing.
- Principle II parity gate reworded to "visual parity within
  documented tolerance + feature parity matrix" rather than "visually
  identical results" (the pixel-tolerance test was already the
  enforceable form).
- Renderer constraints add the line-rendering approach (instanced
  extruded quads, analytic AA), sRGB color working space, and
  PointerEvents-only input.
- Geometry constraints split predicates (Shewchuk, unfacaded) from
  booleans (Clipper2-WASM behind a facade); martinez and
  polygon-clipping dropped.
- File-format constraints fix PDFKit → pdf-lib and note the v2 binary
  format roadmap.
- Three.js permission struck (no 3D viewport spec exists; Principle
  VII requires real callers before keeping the slot).
-->

