// Integration tests for segment, circle, and arc intersection routines.
import { describe, expect, it } from "vitest";
import { asId } from "../../src/ids.js";

import {
  arcParam,
  circleIntersect,
  pointOnSeg,
  segIntersect,
} from "../../src/geometry/intersections.js";
import { installBooleans, booleans } from "../../src/geometry/booleans.js";
import type { ArcEntity } from "../../src/scene/types.js";
import type { Vec2 } from "../../src/geometry/Vec2.js";

const TAU = Math.PI * 2;

const arc = (c: Vec2, r: number, s: number, e: number): ArcEntity => ({
  id: asId("01"),
  layerId: asId("L"),
  color: "byLayer",
  lineweight: "byLayer",
  kind: "arc",
  c,
  r,
  startAngle: s,
  endAngle: e,
});

describe("segIntersect", () => {
  it("proper crossing returns the meeting point", () => {
    const p = segIntersect([0, 0], [4, 4], [0, 4], [4, 0]);
    expect(p).not.toBeNull();
    expect(p![0]).toBeCloseTo(2, 9);
    expect(p![1]).toBeCloseTo(2, 9);
  });

  it("non-overlapping segments return null", () => {
    expect(segIntersect([0, 0], [1, 0], [2, 0], [3, 0])).toBeNull();
    expect(segIntersect([0, 0], [1, 1], [10, 10], [11, 11])).toBeNull();
  });

  it("T-junction returns the touching endpoint", () => {
    const p = segIntersect([0, 0], [4, 0], [2, 0], [2, 5]);
    expect(p).not.toBeNull();
    expect(p![0]).toBeCloseTo(2, 9);
    expect(p![1]).toBeCloseTo(0, 9);
  });

  it("collinear segments report null (overlap not reported)", () => {
    expect(segIntersect([0, 0], [4, 0], [1, 0], [3, 0])).toBeNull();
    expect(segIntersect([0, 0], [4, 0], [5, 0], [9, 0])).toBeNull();
  });

  it("segment-segment touching only at b1 endpoint", () => {
    // Segment a is horizontal; b starts on a's interior, points away.
    const p = segIntersect([-1, 0], [1, 0], [0, 0], [0, 1]);
    expect(p).not.toBeNull();
    expect(p![0]).toBeCloseTo(0, 9);
    expect(p![1]).toBeCloseTo(0, 9);
  });
});

describe("pointOnSeg", () => {
  it("interior point within tolerance returns true", () => {
    expect(pointOnSeg([1, 0], [0, 0], [2, 0], 1e-9)).toBe(true);
    expect(pointOnSeg([1, 1e-10], [0, 0], [2, 0], 1e-9)).toBe(true);
  });

  it("off-segment point returns false", () => {
    expect(pointOnSeg([1, 0.5], [0, 0], [2, 0], 1e-9)).toBe(false);
    expect(pointOnSeg([3, 0], [0, 0], [2, 0], 1e-9)).toBe(false);
  });

  it("degenerate (zero-length) segment compares as point distance", () => {
    expect(pointOnSeg([0, 0], [1, 1], [1, 1], 2)).toBe(true);
    expect(pointOnSeg([5, 5], [1, 1], [1, 1], 0.1)).toBe(false);
  });

  it("endpoint counts as on-segment", () => {
    expect(pointOnSeg([0, 0], [0, 0], [1, 0], 0)).toBe(true);
    expect(pointOnSeg([1, 0], [0, 0], [1, 0], 0)).toBe(true);
  });
});

describe("circleIntersect", () => {
  it("disjoint circles return empty array", () => {
    expect(circleIntersect([0, 0], 1, [10, 0], 1)).toEqual([]);
  });

  it("nested circles return empty array", () => {
    expect(circleIntersect([0, 0], 5, [0.5, 0], 1)).toEqual([]);
  });

  it("coincident circles return empty array (overlap not enumerated)", () => {
    expect(circleIntersect([0, 0], 5, [0, 0], 5)).toEqual([]);
  });

  it("tangent circles return a single point", () => {
    const r = circleIntersect([0, 0], 1, [2, 0], 1);
    expect(r.length).toBe(1);
    expect(r[0]![0]).toBeCloseTo(1, 9);
    expect(r[0]![1]).toBeCloseTo(0, 9);
  });

  it("two intersecting circles return both points", () => {
    const r = circleIntersect([0, 0], 1, [1, 0], 1);
    expect(r.length).toBe(2);
    // Symmetric about y=0 at x=0.5.
    expect(r[0]![0]).toBeCloseTo(0.5, 9);
    expect(r[1]![0]).toBeCloseTo(0.5, 9);
    expect(Math.abs(r[0]![1] + r[1]![1])).toBeLessThan(1e-9);
  });
});

describe("arcParam", () => {
  it("returns 0 at start, 1 at end for an unwrapped arc", () => {
    const a = arc([0, 0], 1, 0, Math.PI);
    expect(arcParam(a, [1, 0])).toBeCloseTo(0, 9);
    expect(arcParam(a, [-1, 0])).toBeCloseTo(1, 9);
  });

  it("returns ~0.5 at the midpoint of a quarter arc", () => {
    const a = arc([0, 0], 1, 0, Math.PI / 2);
    const mid: Vec2 = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)];
    expect(arcParam(a, mid)).toBeCloseTo(0.5, 6);
  });

  it("returns null off the supporting circle", () => {
    const a = arc([0, 0], 1, 0, Math.PI);
    expect(arcParam(a, [2, 0])).toBeNull();
  });

  it("returns null in the gap of an unwrapped arc", () => {
    const a = arc([0, 0], 1, 0, Math.PI / 2);
    // (0,-1) is at 3π/2, outside [0, π/2].
    expect(arcParam(a, [0, -1])).toBeNull();
  });

  it("handles wrapped arcs (3π/2 → π/2)", () => {
    const a = arc([0, 0], 1, (3 * Math.PI) / 2, Math.PI / 2);
    // E extremum (1, 0) at theta=0 → halfway through a π sweep.
    expect(arcParam(a, [1, 0])).toBeCloseTo(0.5, 6);
    // A point at angle 3π/4 falls in the gap — outside the wrap.
    const gap: Vec2 = [Math.cos((3 * Math.PI) / 4), Math.sin((3 * Math.PI) / 4)];
    expect(arcParam(a, gap)).toBeNull();
  });

  it("zero-sweep arc returns null", () => {
    const a = arc([0, 0], 1, 0, 0);
    expect(arcParam(a, [1, 0])).toBeNull();
  });

  it("range covers the full [0, 1] interval for a representative arc", () => {
    // Just to land coverage on the t<s wrap branch.
    const a = arc([0, 0], 1, TAU - 0.5, 0.5);
    expect(arcParam(a, [Math.cos(0), Math.sin(0)])).toBeCloseTo(0.5, 6);
    expect(arcParam(a, [Math.cos(TAU - 0.5), Math.sin(TAU - 0.5)])).toBeCloseTo(0, 6);
  });
});

describe("booleans facade", () => {
  it("throws before installation, accepts a single install, refuses a second", () => {
    expect(() => booleans.union([], [])).toThrow(/not installed/);
    const stub = {
      union: () => [],
      difference: () => [],
      intersection: () => [],
      offsetPolygon: () => [],
    };
    installBooleans(stub);
    expect(booleans.union([], [])).toEqual([]);
    expect(() => installBooleans(stub)).toThrow(/already installed/);
  });
});
