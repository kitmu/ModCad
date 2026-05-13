// T030 — SpatialIndex / DynamicIndex integration.
import { describe, it, expect } from "vitest";
import {
  buildStaticIndex,
  DynamicIndex,
} from "../../src/index/SpatialIndex.js";
import { asId } from "../../src/ids.js";
import type { Id } from "../../src/ids.js";
import type { Bbox } from "../../src/geometry/Bbox.js";

function bbox(minX: number, minY: number, maxX: number, maxY: number): Bbox {
  return { minX, minY, maxX, maxY };
}

describe("buildStaticIndex", () => {
  it("queryBox returns all overlapping ids", () => {
    const a: Id = asId("a");
    const b: Id = asId("b");
    const c: Id = asId("c");
    const idx = buildStaticIndex([
      { id: a, bbox: bbox(0, 0, 10, 10) },
      { id: b, bbox: bbox(5, 5, 15, 15) },
      { id: c, bbox: bbox(100, 100, 110, 110) },
    ]);
    const hits = new Set(idx.queryBox(bbox(7, 7, 8, 8)));
    expect(hits.has(a)).toBe(true);
    expect(hits.has(b)).toBe(true);
    expect(hits.has(c)).toBe(false);
    expect(idx.size).toBe(3);
  });

  it("queryPoint picks ids within tolerance", () => {
    const a: Id = asId("a");
    const b: Id = asId("b");
    const idx = buildStaticIndex([
      { id: a, bbox: bbox(0, 0, 1, 1) },
      { id: b, bbox: bbox(10, 10, 11, 11) },
    ]);
    expect(new Set(idx.queryPoint([0.5, 0.5], 0.1))).toEqual(new Set([a]));
    expect(new Set(idx.queryPoint([10.5, 10.5], 0.1))).toEqual(new Set([b]));
    // Tolerance wide enough to reach b but not a.
    expect(new Set(idx.queryPoint([10.5, 10.5], 5))).toEqual(new Set([b]));
  });

  it("handles empty input", () => {
    const idx = buildStaticIndex([]);
    expect(idx.size).toBe(0);
    expect(idx.queryBox(bbox(0, 0, 1, 1))).toEqual([]);
    expect(idx.queryPoint([0, 0], 1)).toEqual([]);
  });
});

describe("DynamicIndex", () => {
  it("insert + queryBox stays consistent", () => {
    const idx = new DynamicIndex();
    const a: Id = asId("a");
    const b: Id = asId("b");
    idx.insert(a, bbox(0, 0, 1, 1));
    idx.insert(b, bbox(10, 10, 11, 11));
    expect(new Set(idx.queryBox(bbox(0, 0, 5, 5)))).toEqual(new Set([a]));
    expect(new Set(idx.queryBox(bbox(0, 0, 20, 20)))).toEqual(new Set([a, b]));
  });

  it("remove evicts the entry", () => {
    const idx = new DynamicIndex();
    const a: Id = asId("a");
    idx.insert(a, bbox(0, 0, 1, 1));
    expect(idx.size).toBe(1);
    idx.remove(a);
    expect(idx.size).toBe(0);
    expect(idx.queryBox(bbox(0, 0, 1, 1))).toEqual([]);
  });

  it("update moves the entry's bbox", () => {
    const idx = new DynamicIndex();
    const a: Id = asId("a");
    idx.insert(a, bbox(0, 0, 1, 1));
    idx.update(a, bbox(100, 100, 101, 101));
    expect(idx.queryBox(bbox(0, 0, 5, 5))).toEqual([]);
    expect(new Set(idx.queryBox(bbox(99, 99, 102, 102)))).toEqual(new Set([a]));
  });

  it("queryPoint respects tolerance", () => {
    const idx = new DynamicIndex();
    const a: Id = asId("a");
    idx.insert(a, bbox(5, 5, 6, 6));
    expect(idx.queryPoint([5.5, 5.5], 0.1)).toEqual([a]);
    expect(idx.queryPoint([0, 0], 0.1)).toEqual([]);
  });

  it("remove of unknown id is a no-op", () => {
    const idx = new DynamicIndex();
    idx.remove(asId("nope"));
    expect(idx.size).toBe(0);
  });
});
