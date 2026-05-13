# Architecture

ModCad is a Vite/React app composed from four pure-TypeScript packages
that never depend on the DOM. The package seams are enforced by
`eslint-plugin-boundaries`; the canonical list lives in
[`specs/001-2d-drafting-mvp/contracts/README.md`](../specs/001-2d-drafting-mvp/contracts/README.md).

## High-level diagram

```
┌───────────────────────────────────────────────────────────────┐
│                          apps/web                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ React shell │  │ palette/dispatch │ Zustand stores      │   │
│  │ Workspace   │  │ keybindings   │  │ session, viewport, │   │
│  │ TabStrip    │  │ commandRouter │  │ selection, palette │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
        │ Drawing, Bus            │ Scene                │ Codec
        ▼                          ▼                      ▼
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ @modcad/core    │    │ @modcad/renderer │    │ @modcad/codecs   │
│  Drawing        │    │  WebGPU/WebGL2   │    │  .modcad / DXF / │
│  CommandBus     │    │  Scene API       │    │  SVG / PDF /     │
│  Snap, Selection│    │  Tiled fat-line  │    │  reader+writer   │
│  Geometry       │    │  Picking         │    │                  │
└─────────────────┘    └──────────────────┘    └──────────────────┘
        ▲                       │                       │
        └───────────────────────┴───────────────────────┘
                  (read-only Entity / Drawing types)

                       @modcad/ui-kit
            framework-free primitives (ColorPicker, Ranked)
```

## Seam responsibilities

### `@modcad/core`

The kernel. Owns the data model (`Drawing`, `Entity`, `Layer`,
`CommandBus`, `Selection`, `SnapEngine`) and all business logic that
must remain DOM-free so the headless test harness can drive it
directly. Every committed mutation flows through a `Command`
factory and the `CommandBus` (FR-006).

Forbidden imports: `react`, `vite`, `@modcad/renderer`, `@modcad/codecs`.

### `@modcad/renderer`

The drawing surface. Consumes a `Scene` snapshot produced from a
`Drawing`, manages tile invalidation, and submits draw calls to
WebGPU (preferred) or WebGL2 (fallback). Exposes a tiny imperative
API: `Scene` plus `submitFrame`. Pure of React.

Forbidden imports: `react`, `@modcad/codecs`.

### `@modcad/codecs`

I/O. Each format is a pair of pure functions
`(bytes | string) → Drawing` and `Drawing → bytes | string`. No
mutation, no React, no renderer.

Forbidden imports: `react`, `@modcad/renderer`.

### `@modcad/ui-kit`

Framework-free UI bits and ranking helpers. The `Ranked` type used
by the command palette, the headless color picker model. Pure
TypeScript so tests can run in Node.

Forbidden imports: `apps/web`.

### `apps/web`

The Vite + React shell that wires everything together. Zustand
stores hold the per-session state (`DrawingSessionStore`, palette,
selection, viewport, theme). Commands are dispatched via the
shared `commandRouter`. The IntlProvider (T122) wraps the
component tree; `<ThemeRoot>` mirrors the user's preference to
`<html data-theme>`.

## Forbidden-import enforcement

`eslint.config.js` registers `eslint-plugin-boundaries` with one
`elements` block per package. The `boundaries/element-types` rule
fails any import that crosses a forbidden edge. New packages must
be added to the same block.

## Build and bundle

`apps/web` builds with Vite. The initial route is constrained by
`tooling/perf-budget.json::bundle.initialRouteGzipKb` and verified
by `tooling/check-bundle.mjs` (T126).
