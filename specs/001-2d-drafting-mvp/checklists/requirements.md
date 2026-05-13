# Specification Quality Checklist: 2D Drafting MVP

**Purpose**: Validate specification completeness and quality before
proceeding to planning

**Created**: 2026-05-12

**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

The spec is ready for `/speckit.plan`. Tech stack decisions are deferred
to plan.md per the constitution.

### Clarifications completed (Session 2026-05-12)

1. PDF export — vector-first with raster fallback for unsupported entities.
2. Default units — prompt on first launch (default mm), persisted as
   global default, overridable per-drawing and globally.
3. Telemetry — deferred to post-v1; v1 ships with zero telemetry.
   Future stance recorded: opt-in, anonymous, crash + feature-usage only.
4. Cross-tab unsaved changes — Web Locks API single-writer with
   "Take over editing" affordance and force-transfer timeout.
5. Multi-document — one drawing per tab in v1; in-tab tabs and detached
   windows deferred to post-v1. **REVERSED 2026-05-13** — see the
   Second CAD-architecture consultation log below. FR-033 now mandates
   an in-app tab strip; FR-032 Web Locks scope narrowed to "same file
   in a separate browser tab/window".

### Post-clarify architectural refinements (Session 2026-05-12)

After an external CAD-architecture consultation, the following were
folded in directly (no questions reopened):

6. Selection model — dual (pre- and post-selection both supported);
   not pinned to select-first because trim, hatch, etc. need
   post-selection.
7. Trim / Extend / Fillet / Chamfer — dual interaction: Quick mode
   (hover-preview, first-crossing) and Classic mode (explicit edges
   via single-pick, fence, window, crossing, or area drag).
8. Predictive snapping — single marker at a time, motion-inferred, Tab
   to cycle alternates, inline distance/angle, soft vs hard distinction.
9. Per-step undo inside multi-step commands; Escape cancels the whole
   in-progress command.
10. Grip-with-contextual-mini-toolbar for direct manipulation.
11. Renderer — WebGPU primary, WebGL2 automatic fallback (constitution
    bumped to v0.2.0 to reflect the change).
12. Future Directions section added to spec: components-as-blocks,
    constraints-by-default, multiplayer, NL command, smart placement,
    versioned-URL refs, paper-space viewport overrides. All out of
    scope for v1.

### Second CAD-architecture consultation (Session 2026-05-13)

A second external review surfaced 22 items. 21 applied, 1 deferred
(prior I1 — Three.js — applied this round). One item reversed an
earlier clarification answer with the user's explicit approval.

**Reversal**: FR-033 changed from "one drawing per tab" to "in-app
tab strip", with cross-window Web Locks (FR-032) narrowed to
"same file opened in a separate browser tab/window".

**Constitution → v0.2.1 (PATCH)**:
- Principle I: explicit three-tier precision regime
  (Tier A 0–10⁶ full / Tier B 10⁶–10⁹ documented degradation /
  Tier C >10⁹ refused). Replaces the prior "1e6 working area"
  phrasing; enables civil/infrastructure-scale drawings.
- Principle II: parity gate reworded — "visual parity within
  documented per-pixel tolerance + feature parity matrix" replaces
  "visually identical results".
- Renderer constraints add line rendering (instanced extruded quads,
  analytic AA), sRGB working space, PointerEvents-only input.
- Geometry: Clipper2-WASM behind a facade for booleans/offsets;
  Shewchuk predicates remain unfacaded in TS. `martinez` /
  `polygon-clipping` rejected for robustness reasons.
- PDFKit → pdf-lib correction.
- Three.js permission struck per Principle VII.

**Spec**: FR-001 adds POINT; FR-002a dynamic input model; FR-005
ARRAYRECT + ARRAYPOLAR (ARRAYPATH out of v1); FR-008a static-cursor
osnap precedence ladder; FR-014 O(changed) dependency graph;
FR-031 autosave retention (last 10 per file in OPFS); FR-032/033
rewritten for tab strip; FR-034 GPU context-loss recovery;
SC-009 ≤400 MB peak heap on 50k bench; Edge Cases updated for tier
system + context loss; Future Directions add OTRACK, ARRAYPATH,
detached windows, binary native format.

**Plan**: lineweight rendering decision (instanced quads + SDF AA);
dimension dependency graph data structure; multi-document state
slices; RTL bidi note; sRGB color management; PointerEvents.

**Research**: precision-tier table; Clipper2 vs martinez rationale;
v2 binary format roadmap (CBOR preferred, MessagePack alternative).

**Tasks**: T017a Clipper2-WASM facade; T021 precision regime + T021a
dim-graph; T028 osnap precedence ladder; T035 fat-line pipeline;
T039a context-loss recovery; T042/T042a tab-strip state slices and UI;
T056a drawPoint; T057a dynamic input; T089 polar array; T100 POINT in
DXF reader; T108 autosave retention; T110 Web Locks narrowed;
T112 tab-strip wiring; T113b tab-strip e2e; T115a memory budget.

### Analyze pass (Session 2026-05-13)

Cross-artifact scan over `spec.md`, `plan.md`, `tasks.md`, and the
constitution surfaced 15 findings. All resolved before
`/speckit.implement` (except I1, deferred to v1 release cleanup):

- **C1 [CRITICAL]** i18n "from day one" — moved wrapper into Phase 2
  as T046a; T122 retained as a maintenance gate.
- **C2 [HIGH]** Perf bench was warn-only — T009 promoted to hard gate
  from Phase 2 with a tightening baseline; T115 reframed as final
  threshold lock-in.
- **C3 [MEDIUM]** Added T026a — vitest coverage gate on
  `packages/core/src/commands/**` at 100% lines + 100% branches.
- **G1 [HIGH]** SC-005 cold/warm load gate — added T126a.
- **G2 [HIGH]** Pan / cursor-anchored zoom / fit — added T031a.
- **G3 [HIGH]** Grid + rulers — added T031b and T031c.
- **G4 [MEDIUM]** Ortho/polar toggles — added T060a.
- **G5 [MEDIUM]** Per-drawing + global units override — added T077a.
- **G6 [MEDIUM]** Offline-mode verification e2e — added T113a.
- **G7 [MEDIUM]** Snap 50 ms latency perf test — added T029a.
- **G8 [LOW]** Command-coverage enforcement script — added T127a.
- **U1 [MEDIUM]** FR-012 amended: locked/frozen layers cannot be
  deleted; UI disables with explanatory tooltip.
- **U2 [LOW]** FR-024 toolbar phrasing left as is; acceptable.
- **A1 [LOW]** Precision regime cross-reference added to
  `research.md` (5×10⁵ rebase / 10⁶ soft ceiling / 10⁷ predicate
  degradation).
- **I1 [LOW]** Three.js permission unused in v1; deferred — will
  tighten the constitution at v1 release.
