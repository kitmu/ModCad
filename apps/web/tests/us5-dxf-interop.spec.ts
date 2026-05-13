// US5 acceptance suite — "DXF/SVG/PDF interop".
//
// Maps to spec FR-017 (DXF import), FR-018 (vector PDF + raster
// fallback), and FR-019 (non-blocking warnings). Drives import/export
// via the dev API (window.__modcad) so we don't have to drive the
// file-system picker in headless Chromium.
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDxfPath = resolve(here, "../../../fixtures/dxf/sample.dxf");
const fixtureDxf = readFileSync(fixtureDxfPath, "utf8");

interface ModcadEntity {
  id: string;
  kind: string;
  layerId: string;
}

interface ModcadDrawing {
  entityOrder: string[];
  entities: Record<string, ModcadEntity>;
  layers: { id: string; name: string }[];
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

test.describe("US5 — DXF / SVG / PDF interop", () => {
  test("1. imports the DXF fixture via the dev API and entity counts match", async ({ page }) => {
    await gotoApp(page);
    const summary = await page.evaluate((source: string) => {
      const r = window.__modcad!.loadDxfText(source);
      const entities: Record<string, { kind: string }> = r.drawing.entities as Record<string, { kind: string }>;
      return {
        warningCount: r.warnings.length,
        entityCount: r.drawing.entityOrder.length,
        kinds: r.drawing.entityOrder.map((id) => entities[id]?.kind),
      };
    }, fixtureDxf);
    expect(summary.warningCount).toBe(0);
    expect(summary.entityCount).toBe(2);
    expect(summary.kinds).toEqual(["line", "circle"]);

    // Confirm the active drawing matches.
    const d = await getDrawing(page);
    expect(d).not.toBeNull();
    expect(d!.entityOrder.length).toBe(2);
  });

  test("2. writes the active drawing to DXF and round-trips structurally", async ({ page }) => {
    await gotoApp(page);
    await page.evaluate((source: string) => {
      window.__modcad!.loadDxfText(source);
    }, fixtureDxf);

    const roundResult = await page.evaluate(() => {
      const dxf = window.__modcad!.exportDxfText();
      if (!dxf) return null;
      const before = window.__modcad!.activeDrawing;
      const re = window.__modcad!.loadDxfText(dxf);
      const entities: Record<string, { kind: string }> = re.drawing.entities as Record<string, { kind: string }>;
      return {
        beforeOrder: before?.entityOrder ?? [],
        afterKinds: re.drawing.entityOrder.map((id) => entities[id as string]?.kind),
        afterCount: re.drawing.entityOrder.length,
      };
    });

    expect(roundResult).not.toBeNull();
    expect(roundResult!.afterCount).toBe(roundResult!.beforeOrder.length);
    expect(roundResult!.afterKinds).toEqual(["line", "circle"]);
  });

  test("3. exports to SVG with one <g> per layer", async ({ page }) => {
    await gotoApp(page);
    await page.evaluate((source: string) => {
      window.__modcad!.loadDxfText(source);
    }, fixtureDxf);
    const out = await page.evaluate(() => {
      const svg = window.__modcad!.exportSvgText();
      const d = window.__modcad!.activeDrawing!;
      return {
        svg,
        layerCount: d.layers.length,
      };
    });
    expect(out.svg).not.toBeNull();
    expect(out.svg!.startsWith("<svg ")).toBe(true);
    // One <g data-modcad-layer="..."> per layer.
    const layerMatches = out.svg!.match(/<g data-modcad-layer="/g) ?? [];
    expect(layerMatches.length).toBe(out.layerCount);
  });

  test("4. exports to PDF with %PDF- header and OCG markers", async ({ page }) => {
    await gotoApp(page);
    await page.evaluate((source: string) => {
      window.__modcad!.loadDxfText(source);
    }, fixtureDxf);
    const bytes = await page.evaluate(async () => {
      const pdf = await window.__modcad!.exportPdfBytes({ paperSize: "A4" });
      if (!pdf) return null;
      // Return as a regular array so Playwright can serialize over the bridge.
      return Array.from(pdf);
    });
    expect(bytes).not.toBeNull();
    const arr = new Uint8Array(bytes!);
    const text = new TextDecoder("latin1").decode(arr);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/OCProperties");
    expect(text).toContain("/OCGs");
  });

  test("5. surfaces import warnings via non-blocking notifications (FR-019)", async ({ page }) => {
    await gotoApp(page);
    // Construct a DXF with one unsupported entity so the reader emits
    // an `unsupported-entity` warning.
    const dxfWithSpline = [
      "0\nSECTION\n2\nHEADER\n0\nENDSEC",
      "0\nSECTION\n2\nTABLES",
      "0\nTABLE\n2\nLAYER\n70\n1",
      "0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n370\n25",
      "0\nENDTAB",
      "0\nENDSEC",
      "0\nSECTION\n2\nENTITIES",
      "0\nSPLINE\n8\n0\n10\n0.0\n20\n0.0",
      "0\nENDSEC",
      "0\nEOF",
      "",
    ].join("\n");
    await page.evaluate((source: string) => {
      window.__modcad!.loadDxfText(source);
    }, dxfWithSpline);
    const toaster = page.getByTestId("notifications");
    await expect(toaster).toBeVisible();
    const items = toaster.getByTestId("notification");
    await expect(items.first()).toContainText(/SPLINE/);
  });
});
