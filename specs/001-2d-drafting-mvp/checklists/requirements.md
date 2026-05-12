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
   windows deferred to post-v1.

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
