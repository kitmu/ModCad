// T126 — Bundle size budget.
//
// After `pnpm --filter @modcad/web build` writes the production
// bundle to `apps/web/dist/`, this script measures the gzipped size
// of the initial-route asset and compares it to the budget recorded
// in `tooling/perf-budget.json` (`bundle.initialRouteGzipKb`).
//
// Definition of "initial route": every JS asset that the generated
// `index.html` references via `<script type="module" src=…>` plus
// every `modulepreload` it lists. CSS and the lazy chunks that those
// scripts pull in dynamically are tracked separately (out of scope
// for v1).
//
// CI wires this into the release pipeline via
// `pnpm --filter @modcad/web check:bundle`.
import { readFile, access } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "apps/web/dist");
const BUDGET = JSON.parse(
  await readFile(join(ROOT, "tooling/perf-budget.json"), "utf8"),
);
const BUDGET_KB = BUDGET.bundle.initialRouteGzipKb;

try {
  await access(DIST);
} catch {
  console.error(`[check-bundle] FAIL: ${DIST} not present. Run \`pnpm --filter @modcad/web build\` first.`);
  process.exit(1);
}

const htmlPath = join(DIST, "index.html");
const html = await readFile(htmlPath, "utf8");

// Collect every JS asset referenced by the entry HTML, both as a
// <script> and as a <link rel="modulepreload">. These all execute
// before the app reaches "interactive".
const scriptSrc = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]);
const preload = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)].map(
  (m) => m[1],
);
const assets = [...new Set([...scriptSrc, ...preload])].map((p) =>
  p.startsWith("/") ? p.slice(1) : p,
);

if (assets.length === 0) {
  console.error("[check-bundle] FAIL: no JS assets discovered in dist/index.html");
  process.exit(1);
}

let totalRaw = 0;
let totalGz = 0;
const rows = [];
for (const a of assets) {
  const file = join(DIST, a);
  const buf = await readFile(file);
  const gz = gzipSync(buf, { level: 9 });
  totalRaw += buf.byteLength;
  totalGz += gz.byteLength;
  rows.push({ file: a, raw: buf.byteLength, gz: gz.byteLength });
}

const gzKb = totalGz / 1024;
console.log(`[check-bundle] initial route — ${assets.length} asset(s)`);
for (const r of rows.sort((a, b) => b.gz - a.gz)) {
  console.log(`  ${r.file}  raw=${(r.raw / 1024).toFixed(1)}KB  gz=${(r.gz / 1024).toFixed(1)}KB`);
}
console.log(
  `[check-bundle] total raw=${(totalRaw / 1024).toFixed(1)}KB gz=${gzKb.toFixed(1)}KB budget=${BUDGET_KB}KB`,
);

if (gzKb > BUDGET_KB) {
  console.error(
    `[check-bundle] FAIL: initial-route gzip ${gzKb.toFixed(1)}KB exceeds budget ${BUDGET_KB}KB`,
  );
  process.exit(1);
}
console.log("[check-bundle] OK");
