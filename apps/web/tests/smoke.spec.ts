// Phase 1 smoke: the dev server boots and the React shell renders.
// Real US1+ specs replace/extend this in later phases.
import { test, expect } from "@playwright/test";

test("workspace renders with one default drawing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("workspace")).toBeVisible();
  await expect(page.getByTestId("tab-strip")).toBeVisible();
  // FR-033: a fresh boot opens one slot so the user never lands on empty.
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByTestId("canvas")).toBeVisible();
});

test("FR-033: opening a second slot adds a tab", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("tab-new").click();
  await expect(page.getByRole("tab")).toHaveCount(2);
});
