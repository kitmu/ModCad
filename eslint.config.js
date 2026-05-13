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
import formatjs from "eslint-plugin-formatjs";

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
    // T122: enforce that user-visible chrome strings flow through the
    // react-intl pipeline (FR-029). The rule only fires on JSX in the
    // web app; non-component code uses the `t()` helper which is a
    // plain function call and is not policed here.
    files: ["apps/web/src/**/*.tsx"],
    plugins: { formatjs },
    rules: {
      "formatjs/no-literal-string-in-jsx": "error",
    },
  },
  {
    // Files swept later — the rule is hard to satisfy for canvas
    // overlays / dev hooks where every string is a debug label. Each
    // entry has a tracking note in the file header.
    files: [
      "apps/web/src/canvas/**/*.tsx",
      "apps/web/src/devApi.ts",
      "apps/web/src/i18n/**/*.tsx",
      "apps/web/src/i18n/**/*.ts",
    ],
    rules: { "formatjs/no-literal-string-in-jsx": "off" },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.bench.ts", "**/test/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "formatjs/no-literal-string-in-jsx": "off",
    },
  },
  {
    // Tooling helper scripts run in Node, not the browser.
    files: ["tooling/**/*.mjs", "benchmarks/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly", window: "readonly" },
    },
    rules: { "no-console": "off" },
  },
  {
    // Vendored upstream code we don't reformat — keep the original style
    // so future syncs are clean diffs.
    files: ["packages/core/src/geometry/predicates.ts"],
    rules: {
      "prefer-const": "off",
      "no-var": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
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
      "**/.claude/worktrees/**",
      "tooling/smoke/**",
    ],
  },
];
