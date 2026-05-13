import { defineConfig, mergeConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import root from "../../vitest.config.js";

export default mergeConfig(
  root,
  defineConfig({
    plugins: [react()],
    test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"], environment: "jsdom" },
  }),
);
