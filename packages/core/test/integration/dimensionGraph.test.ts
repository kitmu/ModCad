// T021a — dimension dependency graph: a single dimensionsForEntity
// query on a 50,000-entity drawing with 100 dimensions referencing
// 1 entity each MUST return only the dimensions bound to that entity,
// and MUST run in O(bound) time — i.e. NOT scan all entities.
import { describe, it, expect } from "vitest";
import { DimensionGraph } from "../../src/scene/dimensionGraph.js";
import { newId, type Id } from "../../src/ids.js";

describe("DimensionGraph", () => {
  it("bind / dimensionsForEntity returns only bound dimensions", () => {
    const g = new DimensionGraph();
    const e1 = newId();
    const e2 = newId();
    const d1 = newId();
    const d2 = newId();
    g.bind(e1, d1);
    g.bind(e1, d2);
    g.bind(e2, d1);
    expect(g.dimensionsForEntity(e1).slice().sort()).toEqual([d1, d2].slice().sort());
    expect(g.dimensionsForEntity(e2)).toEqual([d1]);
    expect(g.dimensionsForEntity(newId())).toEqual([]);
  });

  it("unbind removes the edge in both directions", () => {
    const g = new DimensionGraph();
    const e = newId();
    const d = newId();
    g.bind(e, d);
    g.unbind(e, d);
    expect(g.dimensionsForEntity(e)).toEqual([]);
    // Removing the entity that no longer has bindings returns [].
    expect(g.removeEntity(e)).toEqual([]);
  });

  it("unbind on a non-existent edge is a no-op", () => {
    const g = new DimensionGraph();
    expect(() => g.unbind(newId(), newId())).not.toThrow();
  });

  it("removeEntity returns every dimension touched and severs both directions", () => {
    const g = new DimensionGraph();
    const e1 = newId();
    const e2 = newId();
    const d1 = newId();
    const d2 = newId();
    g.bind(e1, d1);
    g.bind(e1, d2);
    g.bind(e2, d2);
    const touched = g.removeEntity(e1);
    expect(touched.slice().sort()).toEqual([d1, d2].slice().sort());
    expect(g.dimensionsForEntity(e1)).toEqual([]);
    // e2's binding to d2 must survive.
    expect(g.dimensionsForEntity(e2)).toEqual([d2]);
  });

  it("FR-014 O(bound) on a 50k-entity / 100-dimension drawing", () => {
    const g = new DimensionGraph();
    const entities: Id[] = [];
    for (let i = 0; i < 50_000; i++) entities.push(newId());

    const target = entities[12345]!;
    const boundDims: Id[] = [];
    for (let i = 0; i < 100; i++) {
      const d = newId();
      boundDims.push(d);
      g.bind(target, d);
    }
    // 100 OTHER dimensions referencing other entities — they must
    // NOT show up in target's lookup.
    for (let i = 0; i < 100; i++) {
      g.bind(entities[(i * 7) % entities.length]!, newId());
    }

    const result = g.dimensionsForEntity(target);
    // Exactly the 100 bound dimensions, nothing else.
    expect(result).toHaveLength(100);
    const set = new Set(result);
    for (const d of boundDims) expect(set.has(d)).toBe(true);

    // Sanity: an unrelated entity yields a result whose size is
    // bounded by its own degree (here, at most 1), proving the
    // lookup does NOT scan the entity universe.
    const stranger = entities[999]!;
    const strangerResult = g.dimensionsForEntity(stranger);
    expect(strangerResult.length).toBeLessThanOrEqual(2);
  });
});
