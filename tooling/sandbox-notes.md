# Sandbox notes

Notes for running the dev/test loop in the Claude Code on the Web
sandbox specifically. None of this applies to a developer's laptop or
to standard CI — see `quickstart.md` for the canonical commands.

## Smoke results (2026-05-13)

Verified before Phase 1 implementation began:

| Tool | Result |
|---|---|
| Node 22 + pnpm 10 install | ✅ |
| TypeScript 5.4 `--strict` + `noUncheckedIndexedAccess` typecheck | ✅ |
| Vitest 1.6 unit tests with `fast-check` property tests | ✅ |
| Vite 5 dev server | ✅ |
| Playwright 1.56 Chromium e2e against the dev server | ✅ |
| WebGL2 in headless Chromium (SwiftShader software path) | ✅ |
| WebGPU in headless Chromium with SwiftShader flags | ✅ |

A trivial `orient2d` predicate plus a sign-symmetry property test passed
in Vitest in 13 ms. A canvas page reporting WebGL2 and WebGPU adapter
status passed end-to-end against the cached Chromium.

## Sandbox-specific gotchas

### 1. Playwright browsers are pre-cached at a non-default path

`/opt/pw-browsers` contains Chromium revision **1194** and the
matching headless shell. Playwright will look for browsers under
`~/.cache/ms-playwright` by default and re-download.

**Workaround**: export `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
before every `playwright` invocation. Either set it in CI / the shell
or add `playwright.browsers.path` to the project config.

### 2. Cached revision is tied to Playwright 1.56.1

`@playwright/test@^1.57.x` looks for chromium revision **1223** which
isn't cached, so e2e fails with `Executable doesn't exist at …`.

**Workaround**: pin `@playwright/test` to `1.56.1` in
`apps/web/package.json` until CI moves to a new cache. Bump when CI
ships a newer cache.

### 3. WebGPU requires SwiftShader flags in this VM

Headless Chromium in this sandbox does not expose a WebGPU adapter
out of the box. With the flags
`--enable-unsafe-webgpu --use-vulkan=swiftshader --enable-features=Vulkan`
the adapter and device come up cleanly.

**Implication**: T033 (WebGPU backend) and the renderer-parity test
(T040/T041) can be exercised here, but **performance and frame-time
numbers will be CPU-rendered and are not representative of baseline
hardware**. Treat the sandbox as a functional gate; perf budgets
(SC-003, SC-009) are validated on real hardware in CI.

Playwright config snippet:

```ts
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "chromium-webgpu", use: {
    ...devices["Desktop Chrome"],
    launchOptions: { args: [
      "--enable-unsafe-webgpu",
      "--use-vulkan=swiftshader",
      "--enable-features=Vulkan",
    ] },
  } },
],
```

### 4. WebGL2 vendor/renderer are masked

Vendor reports as `WebKit` and renderer as `WebKit WebGL` in the
sandbox — a privacy mask, not a software-renderer indicator. This
is expected and identical to user-facing browsers; tests must not
rely on a specific renderer string.

## Quick verification

```bash
# from a fresh shell in the sandbox:
cd /tmp && rm -rf smoke && mkdir smoke && cd smoke
# (re-run the smoke project — see git history for the recipe)
```

The actual Phase 1 work (T001 onward) reads this file once and never
again — it's only here to keep the dev loop unblocked in this
specific environment.
