// T123 — WCAG 2.2 AA audit (FR-027).
//
// Runs @axe-core/playwright against three app states:
//   1. idle workspace
//   2. command palette open
//   3. layer tree open (always rendered in the sidebar)
//
// The suite reports a documented list of known violations slated for
// v1.1 (see KNOWN_VIOLATIONS) and fails only on novel rule IDs. This
// matches the Phase-11 DOD: "passes or reports a documented list of
// known violations to fix in v1.1, not crash".
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Violations the team has accepted for v1.1 follow-up. New violation
// IDs not in this set fail the test. Document the rationale next to
// each entry — every rule must eventually be fixed or moved into the
// permanent suppression list with a code change.
const KNOWN_VIOLATIONS: ReadonlySet<string> = new Set([
  // Layer-tree toggles are 18×18px; lifting them to 24×24 per WCAG 2.2
  // §2.5.8 risks reflowing the sidebar density. Scheduled for v1.1.
  "target-size",
  "target-offset",
  // Dimension labels and notification toasts ride on canvas-backed
  // colors; the contrast pass needs the token rework planned alongside
  // the v1.1 theme polish.
  "color-contrast",
  // The combobox markup will be migrated to the WAI-ARIA 1.2 pattern
  // once Phase-12 keyboard interaction lands.
  "aria-required-attr",
  "aria-required-children",
  "nested-interactive",
  "no-focusable-content",
]);

async function runAxe(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page })
    .withTags(AA_TAGS)
    // The drawing canvas is a graphical surface — text alternatives
    // and contrast rules don't apply to its pixel content.
    .exclude("#modcad-canvas")
    .exclude('[data-testid="canvas"]')
    .exclude('[data-testid="dimension-overlay"]')
    .analyze();
}

function partition(violations: { id: string }[]) {
  const known: string[] = [];
  const novel: string[] = [];
  for (const v of violations) {
    if (KNOWN_VIOLATIONS.has(v.id)) known.push(v.id);
    else novel.push(v.id);
  }
  return { known, novel };
}

test.describe("WCAG 2.2 AA", () => {
  test("idle workspace", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("workspace").waitFor();
    const { violations } = await runAxe(page);
    const { known, novel } = partition(violations);
    if (known.length) {
      console.warn(`[a11y][idle] known v1.1 violations: ${[...new Set(known)].join(", ")}`);
    }
    expect(novel, `novel a11y violations: ${novel.join(", ")}`).toEqual([]);
  });

  test("palette open", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("workspace").waitFor();
    await page.keyboard.press("Control+K");
    await page.getByTestId("palette-input").waitFor();
    const { violations } = await runAxe(page);
    const { known, novel } = partition(violations);
    if (known.length) {
      console.warn(`[a11y][palette] known v1.1 violations: ${[...new Set(known)].join(", ")}`);
    }
    expect(novel, `novel a11y violations: ${novel.join(", ")}`).toEqual([]);
  });

  test("layer tree visible", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("layer-tree").waitFor();
    const { violations } = await runAxe(page);
    const { known, novel } = partition(violations);
    if (known.length) {
      console.warn(`[a11y][layers] known v1.1 violations: ${[...new Set(known)].join(", ")}`);
    }
    expect(novel, `novel a11y violations: ${novel.join(", ")}`).toEqual([]);
  });
});
