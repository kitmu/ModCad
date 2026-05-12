# Quickstart: 2D Drafting MVP

Once Phase 1 lands, this is the local-dev loop.

## Prerequisites

- Node 20 LTS
- pnpm 9+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- A WebGPU-capable browser for local dev (Chrome 113+, Edge 113+,
  Safari 17.4+, Firefox 141+). The WebGL2 fallback works everywhere
  but is exercised by `pnpm test:renderer-parity` rather than the
  dev server.

## First run

```bash
git clone <repo>
cd ModCad
pnpm install
pnpm dev          # vite dev server on http://localhost:5173
```

On first open, the app prompts for a default unit (FR-015a). Pick
mm and continue. The boot route lets you start a new drawing or
open a recent file from the in-browser file picker.

## Common scripts

```bash
pnpm dev                    # vite dev server (app)
pnpm test                   # all package unit tests via vitest
pnpm test:property          # fast-check property tests for geometry
pnpm test:integration       # headless engine integration tests
pnpm test:e2e               # playwright e2e
pnpm test:renderer-parity   # WebGPU vs WebGL2 pixel-diff bench scene
pnpm bench                  # perf bench scene (50k entities)
pnpm build                  # vite production build
pnpm preview                # serve the build
pnpm typecheck              # tsc --noEmit on all packages
pnpm lint                   # eslint
```

## Testing one user story

Each acceptance scenario maps to one Playwright file:

```
apps/web/tests/e2e/
├── us1-draft-from-scratch.spec.ts
├── us2-command-palette.spec.ts
├── us3-layers.spec.ts
├── us4-snap-dimension.spec.ts
├── us5-dxf-interop.spec.ts
├── us6-modify-with-confidence.spec.ts
└── us7-large-drawing.spec.ts
```

Run one:

```bash
pnpm test:e2e -- us1-draft-from-scratch
```

## Headless engine usage (for batch / scripts)

```ts
import { CommandBus, newDrawing, drawLine } from "@modcad/core";

const drawing = newDrawing({ units: "mm" });
const bus = new CommandBus(drawing);
bus.execute(drawLine({ a: [0, 0], b: [100, 0] }));
bus.execute(drawLine({ a: [100, 0], b: [100, 50] }));
console.log(drawing.entities);
```

## Where to look first

- `packages/core/scene/Drawing.ts` — the document type
- `packages/core/commands/CommandBus.ts` — execute / undo / redo
- `packages/renderer/api.ts` — the only public renderer surface
- `apps/web/src/canvas/CanvasHost.tsx` — where the UI meets the renderer
