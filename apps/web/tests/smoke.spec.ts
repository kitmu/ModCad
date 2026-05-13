// Phase 1 smoke: the dev server boots and the React shell renders.
// Real US1+ specs replace/extend this in later phases.
import { test, expect } from "@playwright/test";

test("phase-1 shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("phase")).toHaveText("Phase 1 scaffold");
});
