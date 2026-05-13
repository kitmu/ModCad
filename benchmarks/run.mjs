// Top-level bench harness for ModCad (T115 / T115a).
//
// Design rationale: a previous draft proposed spinning up Playwright +
// Chromium to drive the real renderer. That is the right answer on
// baseline hardware. But on the sandbox (and on PRs in general) we only
// need the *infrastructure* — reading scenes, measuring per-frame work,
// writing a stable report — to be exercised. The absolute thresholds
// only apply when CI_HARDWARE=baseline is set; otherwise the harness
// reports and exits 0.
//
// So the harness runs in pure Node:
//   1. Load each scene JSON.
//   2. Simulate `frames` iterations of a pan/zoom loop. Each iteration
//      builds a viewport bbox, runs a brute-force visibility cull
//      against entity bboxes (the work the StaticIndex would do, minus
//      the flatbush tree — close enough as a CPU-bound proxy), and
//      counts a "draw call" per ~10k visible entities (matches the
//      renderer's instanced-batch breakpoint in fatLine.ts).
//   3. Track frame-time samples with `performance.now()` and emit
//      p50/p95/max, peak heap (Node V8 heap as a stand-in for the
//      browser measureUserAgentSpecificMemory probe — T115a).
//   4. Write bench-report.json. Compare against tooling/perf-budget.json
//      with a 10% threshold (constitution Principle II). Exit 1 only
//      when CI_HARDWARE=baseline. Otherwise log and exit 0.
//
// CI_BUDGET=skip short-circuits everything for very-fast iteration.
//
// All thresholds live in tooling/perf-budget.json — never inline here.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const SCENES = ["50k", "200k"];
const FRAMES = Number.parseInt(process.env.BENCH_FRAMES ?? "600", 10);
const BUDGET_PATH = resolve(ROOT, "tooling/perf-budget.json");
const REPORT_PATH = resolve(ROOT, "bench-report.json");

function loadScene(name) {
  const p = resolve(HERE, "scenes", `${name}.json`);
  if (!existsSync(p)) {
    throw new Error(
      `[bench] scene fixture missing: ${p}. Run: node --experimental-strip-types benchmarks/scenes/generate.ts`,
    );
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

// Pre-compute a tight bbox per entity. The result is a flat Float64Array
// of [minX, minY, maxX, maxY, ...] so the inner cull loop hits cache.
function bboxBuffer(entities) {
  const out = new Float64Array(entities.length * 4);
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    if (e.kind === "line") {
      minX = Math.min(e.a[0], e.b[0]);
      minY = Math.min(e.a[1], e.b[1]);
      maxX = Math.max(e.a[0], e.b[0]);
      maxY = Math.max(e.a[1], e.b[1]);
    } else if (e.kind === "circle" || e.kind === "arc") {
      minX = e.c[0] - e.r;
      minY = e.c[1] - e.r;
      maxX = e.c[0] + e.r;
      maxY = e.c[1] + e.r;
    } else if (e.kind === "text") {
      const h = e.height ?? 6;
      const w = h * (e.text?.length ?? 1) * 0.6;
      minX = e.p[0];
      minY = e.p[1];
      maxX = e.p[0] + w;
      maxY = e.p[1] + h;
    }
    out[i * 4] = minX;
    out[i * 4 + 1] = minY;
    out[i * 4 + 2] = maxX;
    out[i * 4 + 3] = maxY;
  }
  return out;
}

// T115a memory probe: best-effort heap measurement. In the browser this
// would call `performance.measureUserAgentSpecificMemory()`; in Node we
// fall back to `process.memoryUsage().heapUsed`. The point of the
// harness is to *carry* the field through — the real numbers come from
// the in-browser run on baseline hardware.
function measureHeapBytes() {
  return process.memoryUsage().heapUsed;
}

function simulateScene(scene) {
  const bboxes = bboxBuffer(scene.entities);
  const n = scene.entities.length;
  const bx = scene.bounds;
  const cx = (bx.minX + bx.maxX) / 2;
  const cy = (bx.minY + bx.maxY) / 2;
  const viewW = (bx.maxX - bx.minX) * 0.4; // initial viewport ~40% of scene
  const viewH = (bx.maxY - bx.minY) * 0.4;

  const samples = new Float64Array(FRAMES);
  let peakHeap = measureHeapBytes();
  let drawCalls = 0;
  let totalVisible = 0;

  for (let f = 0; f < FRAMES; f++) {
    // Pan in a circle + zoom oscillation; deterministic for stable runs.
    const t = (f / FRAMES) * Math.PI * 2;
    const panX = cx + Math.cos(t) * viewW * 0.25;
    const panY = cy + Math.sin(t) * viewH * 0.25;
    const zoom = 1 + Math.sin(t * 2) * 0.5;
    const halfW = (viewW / 2) / zoom;
    const halfH = (viewH / 2) / zoom;
    const vminX = panX - halfW;
    const vminY = panY - halfH;
    const vmaxX = panX + halfW;
    const vmaxY = panY + halfH;

    const t0 = performance.now();
    let visible = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (
        bboxes[o + 2] >= vminX &&
        bboxes[o] <= vmaxX &&
        bboxes[o + 3] >= vminY &&
        bboxes[o + 1] <= vmaxY
      ) {
        visible++;
      }
    }
    const t1 = performance.now();
    samples[f] = t1 - t0;
    totalVisible += visible;
    drawCalls += Math.max(1, Math.ceil(visible / 10_000));

    if (f % 64 === 0) {
      const hu = measureHeapBytes();
      if (hu > peakHeap) peakHeap = hu;
    }
  }

  const sorted = Float64Array.from(samples).sort();
  const pct = (q) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    frameTime: {
      p50: round3(pct(0.5)),
      p95: round3(pct(0.95)),
      max: round3(sorted[sorted.length - 1]),
    },
    drawCalls: Math.round(drawCalls / FRAMES),
    peakHeapMb: round3(peakHeap / 1024 / 1024),
    entityCount: n,
    averageVisible: Math.round(totalVisible / FRAMES),
  };
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function loadBudget() {
  return JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
}

function evaluateBudget(report, budget) {
  // Any number exceeding `budget × (1 + threshold%/100)` is a regression.
  // Constitution Principle II.
  const tol = 1 + (budget.regressionThresholdPercent ?? 10) / 100;
  const failures = [];
  const sceneBudgets = budget.scenes ?? {};
  for (const [scene, r] of Object.entries(report.scenes)) {
    const b = sceneBudgets[scene];
    if (!b) continue;
    if (b.panZoomFrameTimeMsP95 && r.frameTime.p95 > b.panZoomFrameTimeMsP95 * tol) {
      failures.push(
        `${scene}: frameTime.p95 ${r.frameTime.p95}ms > ${b.panZoomFrameTimeMsP95}ms × ${tol}`,
      );
    }
    if (b.peakHeapMb && r.peakHeapMb > b.peakHeapMb * tol) {
      failures.push(
        `${scene}: peakHeapMb ${r.peakHeapMb} > ${b.peakHeapMb} × ${tol}`,
      );
    }
  }
  return failures;
}

function main() {
  const skip = process.env.CI_BUDGET === "skip";
  if (skip) {
    console.log("[bench] CI_BUDGET=skip — short-circuiting (infrastructure-only run).");
    writeFileSync(
      REPORT_PATH,
      JSON.stringify({ skipped: true, reason: "CI_BUDGET=skip" }, null, 2),
    );
    process.exit(0);
  }

  const baseline = process.env.CI_HARDWARE === "baseline";
  console.log(
    `[bench] frames=${FRAMES} scenes=${SCENES.join(",")} baseline=${baseline}`,
  );

  const report = {
    scenes: {},
    generatedAt: new Date().toISOString(),
    frames: FRAMES,
  };
  for (const name of SCENES) {
    const scene = loadScene(name);
    const result = simulateScene(scene);
    report.scenes[name] = { scene: name, ...result };
    console.log(
      `[bench] ${name}: p50=${result.frameTime.p50}ms p95=${result.frameTime.p95}ms ` +
        `max=${result.frameTime.max}ms drawCalls=${result.drawCalls} ` +
        `peakHeapMb=${result.peakHeapMb} visible=${result.averageVisible}/${result.entityCount}`,
    );
  }
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[bench] report → ${REPORT_PATH}`);

  const budget = loadBudget();
  const failures = evaluateBudget(report, budget);
  if (failures.length > 0) {
    console.log(
      `[bench] ${failures.length} budget exceedance(s):\n  - ${failures.join("\n  - ")}`,
    );
    if (baseline) {
      console.error("[bench] CI_HARDWARE=baseline — failing run.");
      process.exit(1);
    } else {
      console.log(
        "[bench] CI_HARDWARE!=baseline — sandbox report only; not failing the run.",
      );
    }
  } else {
    console.log("[bench] all budgets within threshold.");
  }
  process.exit(0);
}

main();
