// T123 — WCAG 2.2 AA audit (FR-027).
//
// Runs @axe-core/playwright against three app states:
//   1. idle workspace
//   2. command palette open
//   3. layer tree open (always rendered in the sidebar)
//
// Fails on AA-level violations. AAA-only findings are surfaced as
// console output but don't fail the run (FR-027 targets AA).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("WCAG 2.2 AA", () => {
  test("idle workspace has no AA violations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("workspace").waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(AA_TAGS)
      // The drawing canvas is a graphical surface — text alternatives
      // and contrast rules don't apply to its pixel content.
      .exclude("#modcad-canvas")
      .exclude('[data-testid="canvas"]')
      .exclude('[data-testid="dimension-overlay"]')
      .analyze();
    if (results.violations.length > 0) {
      console.warn(
        "[a11y] AA findings on idle:",
        JSON.stringify(
          results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
          null,
          2,
        ),
      );
    }
    expect(results.violations).toEqual([]);
  });

  test("palette open has no AA violations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("workspace").waitFor();
    await page.keyboard.press("Control+K");
    await page.getByTestId("palette-input").waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(AA_TAGS)
      .exclude("#modcad-canvas")
      .exclude('[data-testid="canvas"]')
      .exclude('[data-testid="dimension-overlay"]')
      .analyze();
    if (results.violations.length > 0) {
      console.warn(
        "[a11y] AA findings on palette:",
        JSON.stringify(
          results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
          null,
          2,
        ),
      );
    }
    expect(results.violations).toEqual([]);
  });

  test("layer tree visible has no AA violations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("layer-tree").waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(AA_TAGS)
      .exclude("#modcad-canvas")
      .exclude('[data-testid="canvas"]')
      .exclude('[data-testid="dimension-overlay"]')
      .analyze();
    if (results.violations.length > 0) {
      console.warn(
        "[a11y] AA findings on layer tree:",
        JSON.stringify(
          results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
          null,
          2,
        ),
      );
    }
    expect(results.violations).toEqual([]);
  });
});
