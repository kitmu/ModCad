import { defineConfig, mergeConfig } from "vitest/config";
import root from "../../vitest.config.js";

export default mergeConfig(
  root,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      coverage: {
        // Per-file thresholds enforce robustness gates for the most
        // safety-critical kernel files. Constitution Principle I +
        // Principle IV.
        //
        // - geometry/predicates.ts: 95 line / 100 branch (T018)
        // - command bus: 100 / 100 (to be added with T023)
        thresholds: {
          "src/geometry/predicates.ts": {
            lines: 95,
            branches: 100,
            functions: 100,
            statements: 95,
          },
        },
      },
    },
  }),
);
