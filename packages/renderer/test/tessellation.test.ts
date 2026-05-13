// T117 — off-thread tessellation. The unit test exercises the
// synchronous fallback (which the worker also calls) plus the
// client's gracefully-degraded path when Worker is unavailable
// (the Vitest jsdom env doesn't ship a usable Worker constructor for
// module-type workers from `new URL(...)`).
import { describe, it, expect, beforeEach } from "vitest";
import {
  ARC_INPUT_STRIDE,
  arcSegmentCount,
  tessellateArcsSync,
  type ArcTessellationInput,
} from "../src/workers/protocol.js";
import {
  tessellateArcsInWorker,
  TESSELLATION_GROWTH_THRESHOLD,
  __resetTessellationClient,
} from "../src/workers/tessellationClient.js";

beforeEach(() => {
  __resetTessellationClient();
});

function pack(arcs: ArcTessellationInput[]): Float32Array {
  const buf = new Float32Array(arcs.length * ARC_INPUT_STRIDE);
  for (let i = 0; i < arcs.length; i++) {
    const a = arcs[i] as ArcTessellationInput;
    const o = i * ARC_INPUT_STRIDE;
    buf[o] = a.cx;
    buf[o + 1] = a.cy;
    buf[o + 2] = a.r;
    buf[o + 3] = a.startRad;
    buf[o + 4] = a.sweepRad;
    buf[o + 5] = a.width;
    buf[o + 6] = a.pxPerUnit;
  }
  return buf;
}

describe("arcSegmentCount", () => {
  it("clamps to [6, 256]", () => {
    expect(arcSegmentCount(1, 0.01, 0.001)).toBe(6);
    expect(arcSegmentCount(10_000, Math.PI * 2, 100)).toBe(256);
  });
  it("scales with sweep size", () => {
    const small = arcSegmentCount(10, 0.5, 10);
    const big = arcSegmentCount(10, Math.PI * 2, 10);
    expect(big).toBeGreaterThan(small);
  });
});

describe("tessellateArcsSync", () => {
  it("produces (segments+1) vertex pairs per arc", () => {
    const buf = pack([
      { cx: 0, cy: 0, r: 10, startRad: 0, sweepRad: Math.PI, width: 1, pxPerUnit: 10 },
    ]);
    const { vertices, offsets } = tessellateArcsSync(buf);
    expect(offsets.length).toBe(2);
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(vertices.length);
    // First vertex is the arc start.
    expect(vertices[0]).toBeCloseTo(10, 5);
    expect(vertices[1]).toBeCloseTo(0, 5);
    // Last vertex is the arc end (π later → x=-10, y≈0).
    expect(vertices[vertices.length - 2]).toBeCloseTo(-10, 5);
    expect(vertices[vertices.length - 1]).toBeCloseTo(0, 5);
  });

  it("returns empty buffers for an empty input", () => {
    const r = tessellateArcsSync(new Float32Array(0));
    expect(r.vertices.length).toBe(0);
    expect(r.offsets.length).toBe(1);
    expect(r.offsets[0]).toBe(0);
  });

  it("handles many arcs in one shot", () => {
    const arcs: ArcTessellationInput[] = [];
    for (let i = 0; i < 50; i++) {
      arcs.push({
        cx: i,
        cy: 0,
        r: 1 + i,
        startRad: 0,
        sweepRad: Math.PI / 2,
        width: 1,
        pxPerUnit: 4,
      });
    }
    const r = tessellateArcsSync(pack(arcs));
    expect(r.offsets.length).toBe(51);
    expect(r.offsets[50]).toBe(r.vertices.length);
  });
});

describe("tessellateArcsInWorker", () => {
  it("falls back to sync tessellation under the worker threshold", async () => {
    const arcs: ArcTessellationInput[] = [
      { cx: 0, cy: 0, r: 5, startRad: 0, sweepRad: Math.PI, width: 1, pxPerUnit: 5 },
      { cx: 5, cy: 0, r: 5, startRad: 0, sweepRad: Math.PI, width: 1, pxPerUnit: 5 },
    ];
    const r = await tessellateArcsInWorker(arcs);
    expect(r.type).toBe("tessellated");
    expect(r.offsets.length).toBe(3);
    expect(r.vertices.length).toBeGreaterThan(0);
    // Sync fallback uses requestId 0 (see client.ts).
    expect(r.requestId).toBe(0);
  });

  it("exposes a sane growth threshold constant", () => {
    expect(TESSELLATION_GROWTH_THRESHOLD).toBeGreaterThan(100);
    expect(Number.isFinite(TESSELLATION_GROWTH_THRESHOLD)).toBe(true);
  });
});
