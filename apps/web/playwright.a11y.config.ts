// T123 — Accessibility test config. Loads only the a11y spec, runs in
// chromium, and reuses the same dev-server as the main e2e suite.
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env["CI"]);

export default defineConfig({
  testDir: "./tests",
  testMatch: /a11y\.spec\.ts$/,
  fullyParallel: false,
  reporter: "line",
  retries: isCI ? 1 : 0,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
