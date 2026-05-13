// US3 acceptance suite — "Organize geometry with layers".
//
// Maps 1:1 to spec.md "User Story 3 — Acceptance Scenarios". We drive
// the UI through the layer panel + canvas pointer events and assert via
// the DOM and `window.__modcad` dev API surface (devApi.ts).
import { test, expect, type Page } from "@playwright/test";

interface ModcadEntity {
  id: string;
  kind: string;
  layerId: string;
  [k: string]: unknown;
}

interface ModcadLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  frozen: boolean;
}

interface ModcadDrawing {
  entityOrder: string[];
  entities: Record<string, ModcadEntity>;
  layers: ModcadLayer[];
  currentLayerId: string;
}

async function gotoApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("workspace")).toBeVisible();
  await page.waitForFunction(() => typeof window.__modcad !== "undefined");
}

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  return box;
}

async function pointerClick(page: Page, x: number, y: number): Promise<void> {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.up();
}

async function getDrawing(page: Page): Promise<ModcadDrawing | null> {
  return page.evaluate(
    () => (window.__modcad?.activeDrawing as ModcadDrawing | null) ?? null,
  );
}

async function ensureSidebarOpen(page: Page): Promise<void> {
  // The sidebar is open by default. The toggle button is always present.
  const visible = await page.getByTestId("sidebar").isVisible().catch(() => false);
  if (!visible) {
    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
  }
}

async function addLayerNamed(page: Page, name: string): Promise<void> {
  await ensureSidebarOpen(page);
  await page.getByTestId("layer-new").click();
  // The fresh layer is auto-named; rename it via right-click → Rename.
  // To keep the test deterministic we instead drive the rename through
  // the dev API after the click confirmed the row exists.
  await page.evaluate((targetName) => {
    const d = window.__modcad?.activeDrawing;
    if (!d) return;
    // Most-recently-added layer is at the end of layerOrder.
    const last = d.layerOrder[d.layerOrder.length - 1] as string;
    // Find the layer object and rename it directly through the bus by
    // dispatching a synthetic event isn't available; instead, look up
    // the renameLayerCommand factory exposed on @modcad/core. The dev
    // API doesn't expose command factories, so we use the inline route:
    // open the layer's context menu and use the Rename input. That's
    // covered by the explicit DOM path below.
    void last;
    void targetName;
  }, name);
  // Right-click the most recently added row to bring up the menu.
  // Layer rows have data-testid `layer-row-<name>` where the freshly
  // added layer is named layer1/layer2/etc. The first call after a
  // clean session creates "layer1".
  const freshName = await page.evaluate(() => {
    const d = window.__modcad?.activeDrawing;
    if (!d) return null;
    const lastId = d.layerOrder[d.layerOrder.length - 1] as string;
    return d.layers.find((l) => l.id === lastId)?.name ?? null;
  });
  if (!freshName) throw new Error("fresh layer not found");
  const row = page.getByTestId(`layer-row-${freshName}`);
  await row.click({ button: "right" });
  await expect(page.getByTestId("layer-context-menu")).toBeVisible();
  await page.getByTestId("layer-context-menu").getByText("Rename").click();
  const input = page.getByTestId(`layer-rename-input-${freshName}`);
  await input.fill(name);
  await input.press("Enter");
}

test.describe("US3 — layers", () => {
  test("1. New layer appears in the panel; current layer indicator unchanged", async ({ page }) => {
    await gotoApp(page);
    await ensureSidebarOpen(page);

    const before = await getDrawing(page);
    const beforeCurrentId = before!.currentLayerId;

    await page.getByTestId("layer-new").click();

    const after = await getDrawing(page);
    expect(after!.layers.length).toBe(before!.layers.length + 1);
    // Current layer should NOT have changed unless explicitly set.
    expect(after!.currentLayerId).toBe(beforeCurrentId);
  });

  test("2. Drawing on a current layer assigns the line to that layer", async ({ page }) => {
    await gotoApp(page);
    await ensureSidebarOpen(page);

    await addLayerNamed(page, "walls");

    // Click the new row to make it current.
    await page.getByTestId("layer-row-walls").click();

    const wallsId = await page.evaluate(() => {
      const d = window.__modcad?.activeDrawing;
      return d?.layers.find((l) => l.name === "walls")?.id ?? null;
    });
    expect(wallsId).not.toBeNull();
    await page.waitForFunction(
      (expected) => window.__modcad?.activeDrawing?.currentLayerId === expected,
      wallsId,
    );

    // Draw a line.
    await page.keyboard.press("l");
    await pointerClick(page, 200, 200);
    await pointerClick(page, 400, 200);
    await page.keyboard.press("Escape");

    const d = await getDrawing(page);
    const line = Object.values(d!.entities).find((e) => e.kind === "line");
    expect(line).toBeDefined();
    expect(line!.layerId).toBe(wallsId);
  });

  test("3. Hidden layer's entities are filtered from listVisibleEntities", async ({ page }) => {
    await gotoApp(page);
    await ensureSidebarOpen(page);
    await addLayerNamed(page, "walls");
    await page.getByTestId("layer-row-walls").click();
    await page.keyboard.press("l");
    await pointerClick(page, 200, 200);
    await pointerClick(page, 400, 200);
    await page.keyboard.press("Escape");

    // Confirm entity exists and is currently visible.
    const beforeIds = await page.evaluate(() =>
      (window.__modcad?.visibleEntities ?? []).map((e) => e.id),
    );
    const totalBefore = await page.evaluate(
      () => Object.keys(window.__modcad?.activeDrawing?.entities ?? {}).length,
    );
    expect(totalBefore).toBe(1);
    expect(beforeIds.length).toBe(1);

    // Toggle walls visibility off.
    await page.getByTestId("layer-visible-walls").click();
    const afterVisibleIds = await page.evaluate(() =>
      (window.__modcad?.visibleEntities ?? []).map((e) => e.id),
    );
    const totalAfter = await page.evaluate(
      () => Object.keys(window.__modcad?.activeDrawing?.entities ?? {}).length,
    );
    // Entity is still present in `entities` but filtered from visible list.
    expect(totalAfter).toBe(1);
    expect(afterVisibleIds.length).toBe(0);
  });

  test("4a. Locked layer cannot be deleted; menu Delete is disabled with tooltip", async ({ page }) => {
    await gotoApp(page);
    await ensureSidebarOpen(page);
    await addLayerNamed(page, "walls");

    // Lock the layer via its inline lock toggle.
    await page.getByTestId("layer-lock-walls").click();

    // Right-click → context menu; Delete should be disabled with an
    // explanatory tooltip (FR-012).
    await page.getByTestId("layer-row-walls").click({ button: "right" });
    await expect(page.getByTestId("layer-context-menu")).toBeVisible();
    const del = page.getByTestId("layer-delete-walls");
    await expect(del).toBeDisabled();
    await expect(del).toHaveAttribute("title", /unlock/i);
  });

  test("4b. Modifying an entity on a locked layer fires a non-modal notification", async ({ page }) => {
    await gotoApp(page);
    await ensureSidebarOpen(page);

    // Draw a line on the default "0" layer.
    await page.keyboard.press("l");
    await pointerClick(page, 200, 200);
    await pointerClick(page, 400, 200);
    await page.keyboard.press("Escape");

    // Lock layer "0".
    await page.getByTestId("layer-lock-0").click();

    // Select the entity and try to change its color via the
    // properties-panel byLayer button. The locked layer should reject
    // with a non-modal notification.
    const entityId = await page.evaluate(() => {
      const d = window.__modcad?.activeDrawing;
      return d?.entityOrder[0] ?? null;
    });
    expect(entityId).not.toBeNull();
    await page.evaluate((id) => {
      window.__modcad?.setSelection([id!]);
    }, entityId);

    // Properties panel exposes a byLayer toggle button per field; any
    // mutation should be rejected because the layer is locked.
    // We click the color "byLayer" button (it's a no-op semantically
    // but still routes through setEntityColorCommand and triggers the
    // locked-layer rejection).
    await page.getByTestId("property-color-byLayer").click();
    // Notification surface should now contain a "locked" message.
    await page.waitForFunction(
      () =>
        (window.__modcad?.notifications ?? []).some((n) =>
          /locked/i.test(n.message),
        ),
    );
    const notif = await page.evaluate(() => window.__modcad?.notifications);
    expect(notif!.some((n) => /locked/i.test(n.message))).toBe(true);
  });
});
