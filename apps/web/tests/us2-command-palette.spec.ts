// US2 acceptance suite — "Discover and run any command from the keyboard".
//
// Maps 1:1 to spec.md "User Story 2 — Acceptance Scenarios". We drive
// the app via keyboard only and assert on DOM state for palette
// behaviour and on `window.__modcad.activeDrawing` for the
// coordinate-input scenario.
import { test, expect, type Page } from "@playwright/test";

interface ModcadEntity {
  id: string;
  kind: string;
  [k: string]: unknown;
}

interface ModcadDrawing {
  entityOrder: string[];
  entities: Record<string, ModcadEntity>;
}

async function gotoApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("workspace")).toBeVisible();
  await page.waitForFunction(() => typeof window.__modcad !== "undefined");
}

async function getDrawing(page: Page): Promise<ModcadDrawing | null> {
  return page.evaluate(
    () => (window.__modcad?.activeDrawing as ModcadDrawing | null) ?? null,
  );
}

test.describe("US2 — command palette + keyboard", () => {
  test("1. Ctrl-K opens the palette focused on the search input", async ({ page }) => {
    await gotoApp(page);

    // Palette is closed by default.
    expect(await page.getByTestId("palette-overlay").count()).toBe(0);

    await page.keyboard.press("Control+k");

    // Palette overlay appears and the input is focused.
    await expect(page.getByTestId("palette-overlay")).toBeVisible();
    const input = page.getByTestId("palette-input");
    await expect(input).toBeFocused();
  });

  test('2. typing "rec" surfaces draw.rectangle as the top result with binding shown', async ({
    page,
  }) => {
    await gotoApp(page);
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("palette-input")).toBeFocused();
    await page.keyboard.type("rec");

    // First row is rectangle.
    const rows = page.getByTestId("palette-row");
    await expect(rows.first()).toHaveAttribute("data-command", "draw.rectangle");
    // Binding column shows the AutoCAD default for rectangle ("R").
    const firstBinding = rows.first().getByTestId("palette-row-binding");
    await expect(firstBinding).toHaveText("R");
  });

  test("3. activating a tool from the palette and typing two coordinates draws a line", async ({
    page,
  }) => {
    await gotoApp(page);
    // Open palette, type "line", Enter.
    await page.keyboard.press("Control+k");
    await page.keyboard.type("line");
    await page.keyboard.press("Enter");

    // Active command should be draw.line.
    await page.waitForFunction(() => window.__modcad?.activeCommand === "draw.line");

    // Type two coordinates through the command-line bar.
    const bar = page.getByTestId("command-line-input");
    await bar.click();
    await bar.fill("10,20");
    await page.keyboard.press("Enter");
    await bar.fill("30,40");
    await page.keyboard.press("Enter");

    // Drawing should contain one line from (10,20) to (30,40).
    const d = await getDrawing(page);
    expect(d).not.toBeNull();
    const line = Object.values(d!.entities).find((e) => e.kind === "line")!;
    expect(line).toBeDefined();
    expect(line["a"]).toEqual([10, 20]);
    expect(line["b"]).toEqual([30, 40]);
  });

  test("4. ? opens the bindings reference; Escape closes both modal and palette", async ({
    page,
  }) => {
    await gotoApp(page);

    // Click the canvas first so window-level key listeners see a
    // clean target (body, not an autofocused panel button).
    await page.getByTestId("canvas").click();

    // ? opens the bindings overlay.
    await page.keyboard.press("?");
    await expect(page.getByTestId("bindings-overlay")).toBeVisible();

    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bindings-overlay")).toHaveCount(0);

    // Now open the palette and verify Escape closes it too.
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("palette-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("palette-overlay")).toHaveCount(0);
  });

  test("5. palette pushes accessibility announcements via the live region", async ({ page }) => {
    await gotoApp(page);
    const live = page.getByTestId("aria-live");
    // Live region is mounted but starts empty.
    await expect(live).toBeAttached();
    await page.keyboard.press("Control+k");
    // Some announcement reaches the live region after opening.
    // (Open + initial result count both push messages; we just need
    // *some* announcement to land.)
    await expect(live).not.toHaveText("", { timeout: 2000 });
    await page.keyboard.type("line");
    // Once a query is typed, the count announcement fires with a
    // number — assert that "result" is mentioned.
    await expect(live).toContainText(/result/i, { timeout: 2000 });
  });
});
