# Package seam contracts

The authoritative TypeScript contracts live in each package's
`index.ts`. This file enumerates the cross-package seams so reviewers
can spot accidental coupling.

## Seams

| Consumer | Provider | Surface |
|---|---|---|
| `apps/web` | `@modcad/core` | `Drawing`, `CommandBus`, `Selection`, `SnapEngine`, command factories |
| `apps/web` | `@modcad/renderer` | `Scene` (declarative scene-graph API) |
| `apps/web` | `@modcad/codecs` | `readDxf`, `writeDxf`, `readModcad`, `writeModcad`, `writeSvg`, `writePdf` |
| `@modcad/renderer` | `@modcad/core` | `Entity` (read-only), `Camera`, `Vec2` |
| `@modcad/codecs` | `@modcad/core` | `Drawing`, `Entity`, `Layer` (read-only types only) |

## Forbidden imports

- `@modcad/core` MUST NOT import `react`, `vite`, `@modcad/renderer`,
  `@modcad/codecs`, or any DOM type beyond `globalThis.crypto` and
  `globalThis.performance`.
- `@modcad/renderer` MUST NOT import `react` or any codec.
- `@modcad/codecs` MUST NOT import `react` or any renderer.
- Codecs MUST NOT mutate `Drawing` they read in; they return a fresh
  `Drawing`.

Enforced via `eslint-plugin-boundaries` in `tooling/eslint.config.js`.
