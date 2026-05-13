// US1 acceptance suite — "Draft a simple plan from scratch".
//
// Each test maps to one numbered scenario in specs/001-2d-drafting-mvp/
// spec.md "User Story 1 — Acceptance Scenarios". We drive the app via
// keyboard + canvas pointer events and assert on store state via the
// `window.__modcad` dev API (see apps/web/src/devApi.ts) — the renderer
// is a noop in headless chromium when WebGPU/WebGL2 can't init, so
// pixel-level assertions would be brittle.
//
// The File System Access API is stubbed in scenarios 3+4 by installing
// overrides through `window.__modcad.installFsStub`. The wrapper at
// apps/web/src/files/fsAccess.ts checks for those overrides first.
import { test, expect, type Page } from "@playwright/test";

interface ModcadEntity {
  id: string;
  kind: string;
  layerId: string;
  color: unknown;
  lineweight: unknown;
  [k: string]: unknown;
}

interface ModcadDrawing {
  entityOrder: string[];
  entities: Record<string, ModcadEntity>;
  layers: { id: string }[];
  currentLayerId: string;
}

async function gotoApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("workspace")).toBeVisible();
  // Wait for dev API to mount.
  await page.waitForFunction(() => typeof window.__modcad !== "undefined");
}

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  return box;
}

/** Pointer click in PointerEvents mode at a canvas-relative position. */
async function pointerClick(page: Page, screenX: number, screenY: number): Promise<void> {
  const box = await canvasBox(page);
  // Playwright's mouse API dispatches PointerEvents too — Chromium's
  // mouse pipeline emits both. The app only subscribes to PointerEvents
  // so this works.
  await page.mouse.move(box.x + screenX, box.y + screenY);
  await page.mouse.down();
  await page.mouse.up();
}

async function pointerMove(page: Page, screenX: number, screenY: number): Promise<void> {
  const box = await canvasBox(page);
  await page.mouse.move(box.x + screenX, box.y + screenY);
}

async function getDrawing(page: Page): Promise<ModcadDrawing | null> {
  return page.evaluate(
    () => (window.__modcad?.activeDrawing as ModcadDrawing | null) ?? null,
  );
}

test.describe("US1 — draft from scratch", () => {
  test("1. line tool: two clicks + Esc create one line", async ({ page }) => {
    await gotoApp(page);
    // Press L to activate the line tool.
    await page.keyboard.press("l");
    expect(await page.evaluate(() => window.__modcad?.activeCommand)).toBe("draw.line");

    // Click two distinct grid intersections.
    await pointerClick(page, 200, 200);
    await pointerClick(page, 400, 200);

    // Esc ends the chained-line session.
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.__modcad?.activeCommand)).toBeNull();

    // One line entity should exist.
    const d = await getDrawing(page);
    expect(d).not.toBeNull();
    expect(d!.entityOrder.length).toBe(1);
    const id = d!.entityOrder[0]!;
    expect(d!.entities[id]?.kind).toBe("line");
  });

  test("2. snap marker arms when cursor nears an endpoint", async ({ page }) => {
    await gotoApp(page);

    // Seed: draw a rectangle so we have endpoints to snap to.
    await page.keyboard.press("r");
    await pointerClick(page, 200, 200);
    await pointerClick(page, 400, 300);
    expect(await page.evaluate(() => window.__modcad?.activeCommand)).toBeNull();

    const before = await getDrawing(page);
    expect(before!.entityOrder.length).toBe(1);

    // Now start a line; move cursor near the first corner (~200,200).
    await page.keyboard.press("l");
    await pointerMove(page, 203, 198);
    const snap = await page.evaluate(() => window.__modcad?.activeSnap);
    expect(snap).not.toBeNull();

    // Click commits to the snapped coordinate (the actual endpoint, not
    // the raw cursor).
    await pointerClick(page, 203, 198);
    await pointerMove(page, 600, 200);
    await pointerClick(page, 600, 200);
    await page.keyboard.press("Escape");

    const after = await getDrawing(page);
    // Rectangle + 1 line.
    expect(after!.entityOrder.length).toBe(2);
    const line = Object.values(after!.entities).find((e) => e.kind === "line")!;
    // The line's `a` end should equal the rectangle's first corner — i.e.
    // the snap target, not the raw click coordinate.
    const rect = Object.values(after!.entities).find((e) => e.kind === "polyline")!;
    const rectFirst = (rect["vertices"] as Array<{ p: [number, number] }>)[0]!.p;
    expect((line["a"] as [number, number])).toEqual(rectFirst);
  });

  test("3. Ctrl-S persists bytes and clears the dirty flag", async ({ page }) => {
    await gotoApp(page);

    // Install a save stub so we don't depend on the FS Access picker in
    // headless Chromium.
    await page.evaluate(() => {
      const captured: { bytes: Uint8Array | null } = { bytes: null };
      window.__modcad!.installFsStub({
        save: async (bytes: Uint8Array, name: string) => {
          captured.bytes = bytes;
          // Stash on the api for the test to read directly too.
          window.__modcad!.lastSavedBytes = bytes;
          return name;
        },
      });
      // Stash the capture record so the test can find it.
      (window as unknown as { __captured: typeof captured }).__captured = captured;
    });

    // Draw something so the slice is dirty.
    await page.keyboard.press("l");
    await pointerClick(page, 100, 100);
    await pointerClick(page, 300, 100);
    await page.keyboard.press("Escape");

    expect(await page.evaluate(() => window.__modcad?.activeDirty)).toBe(true);

    // Trigger save.
    await page.keyboard.press("Control+s");
    // Allow async fs path to settle.
    await page.waitForFunction(
      () => window.__modcad?.lastSavedBytes !== null,
    );

    expect(await page.evaluate(() => window.__modcad?.activeDirty)).toBe(false);
    const len = await page.evaluate(
      () => window.__modcad?.lastSavedBytes?.byteLength ?? 0,
    );
    expect(len).toBeGreaterThan(0);
  });

  test("4. reopening saved bytes restores every primitive", async ({ page }) => {
    await gotoApp(page);

    // Install save stub + draw a mixed scene.
    await page.evaluate(() => {
      window.__modcad!.installFsStub({
        save: async (bytes: Uint8Array, name: string) => {
          window.__modcad!.lastSavedBytes = bytes;
          return name;
        },
      });
    });
    await page.keyboard.press("l");
    await pointerClick(page, 100, 100);
    await pointerClick(page, 300, 100);
    await page.keyboard.press("Escape");
    await page.keyboard.press("r");
    await pointerClick(page, 350, 150);
    await pointerClick(page, 500, 250);
    await page.keyboard.press("Control+s");
    await page.waitForFunction(() => window.__modcad?.lastSavedBytes !== null);

    const original = await getDrawing(page);
    expect(original!.entityOrder.length).toBe(2);

    // "Reopen" in a fresh session: hard reload, then feed the bytes back
    // via the dev API. We can't share memory across the reload, so the
    // bytes get stashed in sessionStorage by the page first.
    await page.evaluate(() => {
      const bytes = window.__modcad!.lastSavedBytes!;
      const arr = Array.from(bytes);
      sessionStorage.setItem("__modcad_test_bytes", JSON.stringify(arr));
    });
    await page.reload();
    await page.waitForFunction(() => typeof window.__modcad !== "undefined");

    await page.evaluate(() => {
      const raw = sessionStorage.getItem("__modcad_test_bytes")!;
      const bytes = new Uint8Array(JSON.parse(raw) as number[]);
      window.__modcad!.loadModcadBytes(bytes);
    });

    const reopened = await getDrawing(page);
    expect(reopened!.entityOrder.length).toBe(original!.entityOrder.length);

    // Entity-by-entity structural equality on the geometry-relevant fields.
    const pluck = (e: ModcadEntity): unknown => {
      const copy: Record<string, unknown> = {};
      for (const k of Object.keys(e)) {
        if (k === "id") continue; // ids are stable; we already compared order
        copy[k] = e[k];
      }
      return copy;
    };
    for (let i = 0; i < original!.entityOrder.length; i++) {
      const a = original!.entities[original!.entityOrder[i]!]!;
      const b = reopened!.entities[reopened!.entityOrder[i]!]!;
      expect(pluck(b)).toEqual(pluck(a));
    }
  });

  test("5. Escape cancels in-flight command without committing", async ({ page }) => {
    await gotoApp(page);

    // Start a line tool, click first point, then Escape.
    await page.keyboard.press("l");
    await pointerClick(page, 200, 200);
    expect(await page.evaluate(() => window.__modcad?.activeCommand)).toBe("draw.line");

    const before = await getDrawing(page);
    expect(before!.entityOrder.length).toBe(0);

    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.__modcad?.activeCommand)).toBeNull();

    const after = await getDrawing(page);
    expect(after!.entityOrder.length).toBe(0);
  });
});
