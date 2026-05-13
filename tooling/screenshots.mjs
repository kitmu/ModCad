// T125 — Deterministic screenshot generator.
//
// Boots the app via Playwright, drives a fixed sequence of UI actions,
// and writes 4 PNGs to `docs/screenshots/`. The README's hero image is
// `with-drawing.png`.
//
// Run manually with:
//   pnpm --filter @modcad/web exec node ../../tooling/screenshots.mjs
//
// CI doesn't run this — screenshots are checked into the repo and
// updated by a maintainer when the chrome changes meaningfully.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "docs/screenshots");
const BASE_URL = process.env.MODCAD_URL ?? "http://localhost:5173";

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

async function shot(name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log(`[screenshots] wrote ${name}.png`);
}

try {
  await page.goto(BASE_URL);
  await page.getByTestId("workspace").waitFor();
  await shot("empty");

  // Draw something deterministic via the dev API.
  await page.evaluate(() => {
    const api = window.modcadDevApi;
    if (!api) return;
    api.seedSampleDrawing?.();
  });
  await page.waitForTimeout(250);
  await shot("with-drawing");

  await page.keyboard.press("Control+K");
  await page.getByTestId("palette-input").waitFor();
  await page.getByTestId("palette-input").fill("line");
  await page.waitForTimeout(150);
  await shot("palette-open");
  await page.keyboard.press("Escape");

  // The layer tree is always rendered in the sidebar; capture the
  // panel in isolation by scrolling it into view.
  await page.getByTestId("layer-tree").scrollIntoViewIfNeeded();
  await shot("layers-panel");
} finally {
  await browser.close();
}
