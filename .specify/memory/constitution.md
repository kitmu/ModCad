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
  predicates; floating-point drift is bounded across a 1e6 unit working
  area.
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
scene. Regressions >10% block merge. WebGL is the default renderer;
Canvas2D is only allowed for UI chrome and overlays.

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
- **Renderer**: WebGL2 via a thin wrapper (regl or hand-rolled). Three.js
  is permitted only for the optional 3D viewport, never for 2D drafting.
- **Build**: Vite. Node 20+ for tooling.
- **Styling**: Tailwind CSS + shadcn/ui primitives. No CSS-in-JS runtime.
- **Geometry**: hand-rolled kernel in `packages/geometry/`. Third-party
  geometry libs (martinez, polygon-clipping) are allowed behind our own
  facade; the facade is the API surface the rest of the app sees.
- **File formats**: DXF (libredwg-web or hand-rolled subset), SVG, PDF
  export via PDFKit. Native format is `.modcad` (JSON, gzipped).
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

**Version**: 0.1.0 | **Ratified**: 2026-05-12 | **Last Amended**: 2026-05-12
