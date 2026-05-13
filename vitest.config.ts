// Root vitest config. Each package extends this via its own vitest.config.ts.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/*.bench.ts",
        "**/test/**",
        "tooling/**",
        "apps/web/playwright.config.ts",
      ],
    },
  },
});
