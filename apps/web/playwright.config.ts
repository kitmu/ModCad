// Playwright config for ModCad e2e tests.
//
// Sandbox note (tooling/sandbox-notes.md): pin @playwright/test to 1.56.1 to
// match the pre-cached chromium revision; set PLAYWRIGHT_BROWSERS_PATH=
// /opt/pw-browsers in the sandbox env.
//
// The chromium-webgpu project exists so the renderer-parity and WebGPU-path
// tests can exercise WebGPU on a headless VM via SwiftShader. Real perf
// numbers come from CI on hardware.
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const isCI = Boolean(process.env["CI"]);

const base: PlaywrightTestConfig = {
  testDir: "./tests",
  // a11y.spec.ts runs under playwright.a11y.config.ts (the test:a11y
  // script). Excluding it here keeps the functional e2e gate green
  // even when a11y has known violations slated for v1.1.
  testIgnore: ["**/a11y.spec.ts"],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? "list" : "line",
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-webgpu",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--enable-unsafe-webgpu",
            "--use-vulkan=swiftshader",
            "--enable-features=Vulkan",
          ],
        },
      },
    },
  ],
};

// `workers` is only set when CI=1 because exactOptionalPropertyTypes
// rejects `workers: undefined`.
export default defineConfig(isCI ? { ...base, workers: 1 } : base);
