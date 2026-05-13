// T028a — Snap emission latency budget (FR-008: ≤ 50 ms p95).
//
// Drives a synthetic 10,000-event cursor trace through SnapEngine.query
// and asserts p95 of per-query wall time. We use a modest scene (a few
// hundred lines distributed across the working area) so we exercise
// realistic snap-mode evaluation; the spatial-index gate is approximated
// by passing the entire entity list — the engine's radius filter still
// enforces the work that matters.
import { describe, it, expect } from "vitest";
import { SnapEngine } from "../../src/snap/SnapEngine.js";
import { asId } from "../../src/ids.js";
import type {
  Entity,
  LineEntity,
  SnapMode,
} from "../../src/scene/types.js";

const LAYER = asId("layer-0");

function makeLine(i: number, x: number, y: number): LineEntity {
  return {
    id: asId(`line-${i}`),
    layerId: LAYER,
    color: "byLayer",
    lineweight: "byLayer",
    kind: "line",
    a: [x, y],
    b: [x + 10, y + 5],
  };
}

describe("SnapEngine performance", () => {
  it("p95 query latency ≤ 50 ms across 10,000 events", () => {
    // Build a ~400-entity scene scattered across [0,1000)².
    const entities: Entity[] = [];
    for (let i = 0; i < 400; i++) {
      const x = (i * 53) % 1000;
      const y = (i * 97) % 1000;
      entities.push(makeLine(i, x, y));
    }
    const modes: ReadonlySet<SnapMode> = new Set([
      "endpoint",
      "midpoint",
      "nearest",
      "perpendicular",
    ]);
    const engine = new SnapEngine(
      (box) =>
        entities.filter(
          (e) =>
            e.kind === "line" &&
            e.a[0] <= box.maxX &&
            e.b[0] >= box.minX &&
            e.a[1] <= box.maxY &&
            e.b[1] >= box.minY,
        ),
      { radiusPx: 15, softModes: new Set() },
    );

    const N = 10_000;
    const samples: number[] = new Array<number>(N);
    let last: [number, number] = [500, 500];
    for (let i = 0; i < N; i++) {
      // Synthetic cursor walk: deterministic pseudo-random in [0,1000)².
      const x = (i * 31.7) % 1000;
      const y = (i * 17.3) % 1000;
      const cursor: [number, number] = [x, y];
      const motion: [number, number] = [cursor[0] - last[0], cursor[1] - last[1]];
      const t0 = performance.now();
      engine.query(cursor, modes, 1, motion);
      samples[i] = performance.now() - t0;
      last = cursor;
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(N * 0.95)]!;
    // 50 ms is the FR-008 budget. The kernel is well below this on
    // commodity hardware, but the assertion is the contract.
    expect(p95).toBeLessThanOrEqual(50);
  }, 30_000);
});
