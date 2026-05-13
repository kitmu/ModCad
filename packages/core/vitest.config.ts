import { defineConfig, mergeConfig } from "vitest/config";
import root from "../../vitest.config.js";

export default mergeConfig(
  root,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      coverage: {
        thresholds: {
          // Per constitution Principle IV + analyze finding C3:
          // - geometry predicates: 95 line / 100 branch (per-file gate below)
          // - command bus: 100 / 100 (per-file gate below)
        },
      },
    },
  }),
);
