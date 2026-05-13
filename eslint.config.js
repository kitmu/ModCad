// ESLint flat config — enforces TS, plus the cross-package boundaries
// from specs/001-2d-drafting-mvp/contracts/README.md.
//
// Boundaries:
//   - core MUST NOT import: react, vite, @modcad/renderer, @modcad/codecs
//   - renderer MUST NOT import: react, @modcad/codecs
//   - codecs MUST NOT import: react, @modcad/renderer
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "core", pattern: "packages/core/**" },
        { type: "renderer", pattern: "packages/renderer/**" },
        { type: "codecs", pattern: "packages/codecs/**" },
        { type: "ui-kit", pattern: "packages/ui-kit/**" },
        { type: "web", pattern: "apps/web/**" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        2,
        {
          default: "allow",
          rules: [
            { from: "core", disallow: ["renderer", "codecs", "ui-kit", "web"] },
            { from: "renderer", disallow: ["codecs", "ui-kit", "web"] },
            { from: "codecs", disallow: ["renderer", "ui-kit", "web"] },
            { from: "ui-kit", disallow: ["web"] },
          ],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.bench.ts", "**/test/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Tooling helper scripts run in Node, not the browser.
    files: ["tooling/**/*.mjs", "benchmarks/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
    rules: { "no-console": "off" },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.vite/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "tooling/smoke/**",
    ],
  },
];
