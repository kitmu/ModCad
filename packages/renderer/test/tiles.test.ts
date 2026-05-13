// T116 unit tests for the tile-cache dirty-region invalidation logic.
// Exercises the cache without a real GPU — payloads are inert strings;
// what we care about is the bookkeeping.
import { describe, it, expect } from "vitest";
import {
  TileCache,
  TileInvalidationTracker,
  bucketForZoom,
  shouldActivateTiles,
  tilesForViewport,
  tilesForBbox,
  tileKeyString,
} from "../src/pipelines/tiles.js";

describe("bucketForZoom", () => {
  it("maps zoom=1 to bucket 0", () => {
    expect(bucketForZoom(1)).toBe(0);
  });
  it("maps zoom<1 to a positive bucket (zoomed out)", () => {
    expect(bucketForZoom(0.5)).toBe(1);
    expect(bucketForZoom(0.25)).toBe(2);
  });
  it("maps invalid zoom to 0", () => {
    expect(bucketForZoom(0)).toBe(0);
    expect(bucketForZoom(-1)).toBe(0);
    expect(bucketForZoom(Number.NaN)).toBe(0);
  });
});

describe("shouldActivateTiles", () => {
  it("activates below the default 0.5 threshold", () => {
    expect(shouldActivateTiles(0.4)).toBe(true);
    expect(shouldActivateTiles(0.5)).toBe(true);
    expect(shouldActivateTiles(1)).toBe(false);
  });
});

describe("tilesForViewport", () => {
  it("enumerates the covering tile set inclusively at both edges", () => {
    const keys = tilesForViewport(
      { minX: 0, minY: 0, maxX: 511, maxY: 511 },
      0.5, // bucket 1 → tile size 512 world units
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]).toEqual({ zoomBucket: 1, x: 0, y: 0 });
  });
  it("returns multiple tiles when the viewport straddles boundaries", () => {
    const keys = tilesForViewport(
      { minX: -10, minY: -10, maxX: 600, maxY: 10 },
      0.5,
    );
    // Crosses x=0 boundary into two tiles, y stays in one row.
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });
});

describe("TileCache", () => {
  it("stores and retrieves a tile by key", () => {
    const c = new TileCache();
    const k = { zoomBucket: 1, x: 3, y: 4 };
    c.insert(k, "payload-a", 1024);
    expect(c.has(k)).toBe(true);
    expect(c.get(k)).toBe("payload-a");
    expect(c.size).toBe(1);
    expect(c.usedBytes).toBe(1024);
  });

  it("replaces existing tile and updates byte accounting", () => {
    const c = new TileCache();
    const k = { zoomBucket: 0, x: 0, y: 0 };
    c.insert(k, "a", 100);
    c.insert(k, "b", 250);
    expect(c.size).toBe(1);
    expect(c.usedBytes).toBe(250);
    expect(c.get(k)).toBe("b");
  });

  it("evicts LRU entries when budget exceeded", () => {
    const evicted: string[] = [];
    const c = new TileCache({ maxBytes: 100 });
    c.onEvict((_k, p) => {
      evicted.push(p as string);
    });
    c.insert({ zoomBucket: 0, x: 0, y: 0 }, "a", 40);
    c.insert({ zoomBucket: 0, x: 1, y: 0 }, "b", 40);
    c.insert({ zoomBucket: 0, x: 2, y: 0 }, "c", 40);
    // a should be evicted because total = 120 > 100.
    expect(evicted).toEqual(["a"]);
    expect(c.has({ zoomBucket: 0, x: 0, y: 0 })).toBe(false);
    expect(c.has({ zoomBucket: 0, x: 1, y: 0 })).toBe(true);
    expect(c.has({ zoomBucket: 0, x: 2, y: 0 })).toBe(true);
  });

  it("preserves recently-touched entries from eviction", () => {
    const evicted: string[] = [];
    const c = new TileCache({ maxBytes: 100 });
    c.onEvict((_k, p) => {
      evicted.push(p as string);
    });
    c.insert({ zoomBucket: 0, x: 0, y: 0 }, "a", 40);
    c.insert({ zoomBucket: 0, x: 1, y: 0 }, "b", 40);
    c.touch({ zoomBucket: 0, x: 0, y: 0 }); // a now MRU
    c.insert({ zoomBucket: 0, x: 2, y: 0 }, "c", 40);
    // b should be evicted instead of a.
    expect(evicted).toEqual(["b"]);
  });

  it("invalidateBbox drops every overlapping tile across active buckets", () => {
    const c = new TileCache();
    // Bucket 0: 256-unit tiles. Bucket 1: 512-unit tiles.
    c.insert({ zoomBucket: 0, x: 0, y: 0 }, "b0-00", 100);
    c.insert({ zoomBucket: 0, x: 1, y: 0 }, "b0-10", 100);
    c.insert({ zoomBucket: 0, x: 5, y: 5 }, "b0-far", 100);
    c.insert({ zoomBucket: 1, x: 0, y: 0 }, "b1-00", 100);

    // Bbox 100..300 overlaps b0 tile 0,0 and b0 tile 1,0; on bucket 1
    // (512-unit tiles) it falls inside tile 0,0.
    const dropped = c.invalidateBbox({
      minX: 100,
      minY: 50,
      maxX: 300,
      maxY: 100,
    });

    const droppedKeys = dropped.map(tileKeyString).sort();
    expect(droppedKeys).toContain("0:0:0");
    expect(droppedKeys).toContain("0:1:0");
    expect(droppedKeys).toContain("1:0:0");
    // b0-far at (5,5) was not touched.
    expect(c.has({ zoomBucket: 0, x: 5, y: 5 })).toBe(true);
  });

  it("clear() runs the eviction callback for every tile", () => {
    const evicted: string[] = [];
    const c = new TileCache();
    c.onEvict((_k, p) => {
      evicted.push(p as string);
    });
    c.insert({ zoomBucket: 0, x: 0, y: 0 }, "a", 10);
    c.insert({ zoomBucket: 0, x: 1, y: 1 }, "b", 10);
    c.clear();
    expect(evicted.sort()).toEqual(["a", "b"]);
    expect(c.size).toBe(0);
    expect(c.usedBytes).toBe(0);
  });
});

describe("TileInvalidationTracker", () => {
  it("coalesces multiple writes per entity into one bbox", () => {
    const t = new TileInvalidationTracker();
    t.noteUpsert("e1" as never, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    t.noteUpsert("e1" as never, { minX: 100, minY: 100, maxX: 110, maxY: 110 });
    expect(t.pendingCount).toBe(1);
    const pending = t.pending();
    expect(pending[0]).toEqual({ minX: 0, minY: 0, maxX: 110, maxY: 110 });
  });

  it("drives invalidateBbox to drop tiles covering both old and new positions", () => {
    const c = new TileCache();
    c.insert({ zoomBucket: 0, x: 0, y: 0 }, "old-tile", 10);
    c.insert({ zoomBucket: 0, x: 1, y: 1 }, "new-tile", 10);

    const t = new TileInvalidationTracker();
    t.noteUpsert("e1" as never, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    t.noteUpsert("e1" as never, {
      minX: 260,
      minY: 260,
      maxX: 270,
      maxY: 270,
    });
    for (const b of t.pending()) c.invalidateBbox(b);
    t.reset();

    expect(c.has({ zoomBucket: 0, x: 0, y: 0 })).toBe(false);
    expect(c.has({ zoomBucket: 0, x: 1, y: 1 })).toBe(false);
    expect(t.pendingCount).toBe(0);
  });

  it("tilesForBbox enumerates per bucket", () => {
    const keys = tilesForBbox(
      { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      [0, 1],
    );
    // Bucket 0 (256): one tile. Bucket 1 (512): one tile. Total = 2.
    expect(keys).toHaveLength(2);
    expect(keys.map((k) => k.zoomBucket).sort()).toEqual([0, 1]);
  });
});
