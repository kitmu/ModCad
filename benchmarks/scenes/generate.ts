/* eslint-disable no-console -- one-shot tooling script; stdout is the UX */
// Deterministic 50k / 200k bench fixture generator (T115/T120 prereq).
//
// One-shot script invoked manually or by CI to regenerate
// benchmarks/scenes/{50k,200k}.json. Output is checked in so bench
// runs don't depend on a TypeScript loader at runtime; the JSON is
// the canonical artifact and `benchmarks/run.mjs` reads it directly.
//
// Layout: lines + circles + arcs + text spread uniformly across a
// 5000x5000 area. Counts are tuned so that lines dominate (representative
// of real drafts) and text is rare (it's expensive but rarely the bulk).
//
// Seed-driven mulberry32 PRNG keeps the output byte-stable across runs.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

interface SceneEntity {
  id: string;
  kind: "line" | "circle" | "arc" | "text";
  layerId: string;
  // Per-kind geometry, kept shallow for readability of the JSON.
  a?: [number, number];
  b?: [number, number];
  c?: [number, number];
  r?: number;
  start?: number;
  sweep?: number;
  p?: [number, number];
  text?: string;
  height?: number;
}

interface Scene {
  $schema: string;
  description: string;
  seed: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  entityCount: number;
  entities: SceneEntity[];
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function buildScene(targetCount: number, seed: number): Scene {
  const rnd = mulberry32(seed);
  const W = 5000;
  const H = 5000;

  // Mix: 80% lines, 10% circles, 8% arcs, 2% text. Keeps the renderer's
  // hot path (fat-line pipeline) dominant, which matches real drawings.
  const lineCount = Math.round(targetCount * 0.8);
  const circleCount = Math.round(targetCount * 0.1);
  const arcCount = Math.round(targetCount * 0.08);
  const textCount = targetCount - lineCount - circleCount - arcCount;

  const entities: SceneEntity[] = [];
  let n = 0;

  for (let i = 0; i < lineCount; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    // Short segments (≤ 80 units) — typical drafted line lengths.
    const len = 5 + rnd() * 75;
    const angle = rnd() * Math.PI * 2;
    entities.push({
      id: `L${n++}`,
      kind: "line",
      layerId: "default",
      a: [x, y],
      b: [x + Math.cos(angle) * len, y + Math.sin(angle) * len],
    });
  }
  for (let i = 0; i < circleCount; i++) {
    entities.push({
      id: `C${n++}`,
      kind: "circle",
      layerId: "default",
      c: [rnd() * W, rnd() * H],
      r: 2 + rnd() * 30,
    });
  }
  for (let i = 0; i < arcCount; i++) {
    entities.push({
      id: `A${n++}`,
      kind: "arc",
      layerId: "default",
      c: [rnd() * W, rnd() * H],
      r: 2 + rnd() * 30,
      start: rnd() * Math.PI * 2,
      sweep: Math.PI * (0.25 + rnd()),
    });
  }
  for (let i = 0; i < textCount; i++) {
    entities.push({
      id: `T${n++}`,
      kind: "text",
      layerId: "default",
      p: [rnd() * W, rnd() * H],
      text: `t${i}`,
      height: 4 + rnd() * 8,
    });
  }

  return {
    $schema: "scene-fixture-v1",
    description: `Procedurally generated bench fixture — ${targetCount} entities.`,
    seed,
    bounds: { minX: 0, minY: 0, maxX: W, maxY: H },
    entityCount: entities.length,
    entities,
  };
}

function writeScene(filename: string, targetCount: number, seed: number): void {
  const scene = buildScene(targetCount, seed);
  const outPath = resolve(HERE, filename);
  mkdirSync(dirname(outPath), { recursive: true });
  // Single-line JSON for the entity stream to keep file size manageable
  // (200k pretty-printed crosses 30 MB; one-line lands near 12 MB).
  const head = JSON.stringify(
    {
      $schema: scene.$schema,
      description: scene.description,
      seed: scene.seed,
      bounds: scene.bounds,
      entityCount: scene.entityCount,
    },
    null,
    2,
  );
  // Stitch the entities array on at the end so the head reads naturally.
  const body = `,\n  "entities": [\n${scene.entities
    .map((e) => `    ${JSON.stringify(e)}`)
    .join(",\n")}\n  ]\n}\n`;
  const full = head.replace(/\n}\s*$/, body);
  writeFileSync(outPath, full, "utf8");
  console.log(
    `[generate] ${filename}: wrote ${scene.entityCount} entities (${(
      full.length /
      1024 /
      1024
    ).toFixed(2)} MB)`,
  );
}

// Deterministic seeds; different per fixture so they look distinct under
// inspection. Don't change without bumping perf-budget.json baselines.
writeScene("50k.json", 50_000, 0x50_000);
writeScene("200k.json", 200_000, 0x200_000);
