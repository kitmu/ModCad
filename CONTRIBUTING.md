# Contributing to ModCad

ModCad is built spec-first: every feature starts as a `spec.md`, gets a
`plan.md`, then a dependency-ordered `tasks.md`, then code. Before
writing code, read:

- [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
  — non-negotiable principles
- [`CLAUDE.md`](CLAUDE.md) — working principles for changes
- [`specs/001-2d-drafting-mvp/spec.md`](specs/001-2d-drafting-mvp/spec.md)
  — v1 scope and acceptance criteria

## Dev loop

```bash
pnpm install            # one-time
pnpm dev                # start apps/web on http://localhost:5173
pnpm typecheck          # tsc --noEmit across the workspace
pnpm lint               # eslint flat config; includes boundary + i18n rules
pnpm test               # vitest unit suites
pnpm --filter @modcad/web test:e2e   # Playwright e2e (needs chromium)
pnpm --filter @modcad/web test:a11y  # axe-core accessibility audit
pnpm --filter @modcad/web i18n:extract
pnpm --filter @modcad/web i18n:audit
pnpm --filter @modcad/web check:bundle
```

Sandbox-specific notes (Playwright browsers cache, SwiftShader perf
caveats) live in [`tooling/sandbox-notes.md`](tooling/sandbox-notes.md).

## Adding a feature

1. Run `/speckit.specify` from a Claude Code session in this repo (or
   open `specs/00X-feature-slug/spec.md` directly) and write a spec.
2. Run `/speckit.plan` to design — produces `plan.md`,
   `data-model.md`, `contracts/`, and `research.md`.
3. Run `/speckit.tasks` to break the plan into a numbered task list.
4. Implement task-by-task, following the per-file coverage gates the
   constitution mandates (Principle III).
5. Update `tasks.md` to check off each task as you complete it.

## Commit messages

We use short, imperative subject lines tagged with the task id:

```
T122 — wire react-intl IntlProvider; sweep palette + layer chrome
```

Body wraps at 72 columns. Reference the spec section, FR id, or US
story when the change is non-trivial.

## Coverage gates

Per-file coverage applies (Principle III). Run:

```bash
pnpm test -- --coverage
```

Lines and branches must meet the threshold defined in
`vitest.config.ts` for any file touched by a change. New code paths
land with their own tests.

## i18n discipline (Principle V, FR-029)

User-facing chrome strings flow through react-intl:

- React components use `<FormattedMessage id="…" defaultMessage="…" />`
  or `useIntl().formatMessage({ id })`.
- Non-React code (Zustand actions, error builders, `notify(…)`) uses
  the hook-less `t("…")` helper from `apps/web/src/i18n/messages.ts`.
- Every id lives in `apps/web/src/i18n/en.json`. The audit script
  enforces this: `pnpm --filter @modcad/web i18n:audit`.
- The ESLint rule `formatjs/no-literal-string-in-jsx` catches new raw
  literals. Files with the `/* eslint-disable
  formatjs/no-literal-string-in-jsx -- T046b sweep pending */` header
  are queued for the v1.1 sweep — don't add new literals there.

## Accessibility (FR-027)

Run `pnpm --filter @modcad/web test:a11y` against your changes. The
suite runs `@axe-core/playwright` over three app states (idle,
palette open, layer tree). New WCAG 2.2 AA violations block merge.

## Performance budget (Principle II, SC-005, SC-009)

`tooling/perf-budget.json` is the source of truth. The bench job
fails on regression >10% per scene. `pnpm --filter @modcad/web
check:bundle` enforces the initial-route gzip budget after `vite
build`.

## Architecture pointers

Read [`docs/architecture.md`](docs/architecture.md) for the package
seam map, then the per-package READMEs:

- `packages/core` — kernel: geometry, commands, persistence, no DOM.
- `packages/renderer` — WebGL2/WebGPU drawing surface.
- `packages/codecs` — DXF, SVG, PDF, JSON.
- `packages/ui-kit` — framework-agnostic React-free UI primitives.
- `apps/web` — Vite + React shell that composes the above.

Cross-package import rules are enforced by `eslint-plugin-boundaries`
in `eslint.config.js`. Read `specs/001-2d-drafting-mvp/contracts/README.md`
for the canonical seam list.
