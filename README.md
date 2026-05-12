# ModCad

A browser-native CAD application — the power of AutoCAD with a modern,
keyboard-first UI, zero install, and offline-first persistence.

This repository is at the **specification** stage. No app code has been
written yet. The project is being developed via
[GitHub spec-kit](https://github.com/github/spec-kit): each feature
starts as a `spec.md`, gets a `plan.md`, then a `tasks.md`, then code.

## Status

- ✅ Constitution drafted — see [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- ✅ v1 spec drafted — see [`specs/001-2d-drafting-mvp/spec.md`](specs/001-2d-drafting-mvp/spec.md)
- ⏳ Plan — next, run `/speckit.plan`
- ⏳ Tasks — run `/speckit.tasks` after the plan is approved
- ⏳ Implementation — run `/speckit.implement` after tasks are approved

## Spec-driven workflow

The repo ships the spec-kit slash commands locally under
`.claude/commands/`. From a Claude Code session in this repo:

| Command | Purpose |
|---|---|
| `/speckit.constitution` | Author or update governing principles |
| `/speckit.specify` | Create a new feature spec from a natural-language description |
| `/speckit.clarify` | Resolve `[NEEDS CLARIFICATION]` markers in a spec |
| `/speckit.plan` | Produce an implementation plan for a spec |
| `/speckit.tasks` | Generate a dependency-ordered task list from the plan |
| `/speckit.implement` | Execute the tasks |
| `/speckit.analyze` | Cross-check artifacts for consistency |
| `/speckit.checklist` | Generate a domain-focused quality checklist |

Templates live under `.specify/templates/`; the active feature pointer
lives in `.specify/feature.json`.

## v1 scope (summary)

2D drafting MVP: lines, polylines, circles, arcs, rectangles, ellipses,
text, dimensions, layers, snapping, ortho/polar, pan/zoom, undo/redo,
DXF/SVG/PDF interop, command palette, dark mode, fully offline.

See [`specs/001-2d-drafting-mvp/spec.md`](specs/001-2d-drafting-mvp/spec.md)
for the authoritative scope, requirements, and success criteria.

## Tech direction

Decisions are made in `plan.md`, not here. The constitution constrains
the choice space (TypeScript, React, WebGL2, Vite, Tailwind, Vitest,
Playwright). See [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
