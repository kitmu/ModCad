// Integration tests for bbox helpers, including the entity-dispatch
// shape. These also pin the contract the spatial index relies on.
import { describe, expect, it } from "vitest";

import { asId } from "../../src/ids.js";
import {
  bboxOfArc,
  bboxOfCircle,
  bboxOfEllipse,
  bboxOfEntities,
  bboxOfEntity,
  bboxOfLine,
  bboxOfPoint,
  bboxOfPolyline,
} from "../../src/geometry/primitives.js";
import type {
  ArcEntity,
  CircleEntity,
  DimensionEntity,
  EllipseEntity,
  Entity,
  LineEntity,
  PointEntity,
  PolylineEntity,
  TextEntity,
} from "../../src/scene/types.js";

const TAU = Math.PI * 2;

// Minimal entity factory — only the fields each bbox routine touches.
function makeLine(a: [number, number], b: [number, number]): LineEntity {
  return {
    id: asId("01"),
    layerId: asId("L1"),
    color: "byLayer",
    lineweight: "byLayer",
    kind: "line",
    a,
    b,
  };
}

function makeCircle(c: [number, number], r: number): CircleEntity {
  return { id: asId("01"), layerId: asId("L1"), color: "byLayer", lineweight: "byLayer", kind: "circle", c, r };
}

function makeArc(c: [number, number], r: number, s: number, e: number): ArcEntity {
  return {
    id: asId("01"),
    layerId: asId("L1"),
    color: "byLayer",
    lineweight: "byLayer",
    kind: "arc",
    c,
    r,
    startAngle: s,
    endAngle: e,
  };
}

describe("bboxOfPoint / bboxOfLine", () => {
  it("point collapses to a zero-area box", () => {
    expect(bboxOfPoint([3, -2])).toEqual({ minX: 3, minY: -2, maxX: 3, maxY: -2 });
  });

  it("line spans both endpoints regardless of order", () => {
    expect(bboxOfLine([1, 2], [3, 4])).toEqual({ minX: 1, minY: 2, maxX: 3, maxY: 4 });
    expect(bboxOfLine([3, 4], [1, 2])).toEqual({ minX: 1, minY: 2, maxX: 3, maxY: 4 });
  });
});

describe("bboxOfPolyline", () => {
  it("covers all vertices, ignoring bulge", () => {
    const b = bboxOfPolyline([
      { p: [0, 0], bulge: 0 },
      { p: [10, -1], bulge: 0.5 },
      { p: [5, 8], bulge: 0 },
    ]);
    expect(b).toEqual({ minX: 0, minY: -1, maxX: 10, maxY: 8 });
  });
});

describe("bboxOfCircle", () => {
  it("expands by |r| in each axis", () => {
    expect(bboxOfCircle([0, 0], 5)).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
    expect(bboxOfCircle([2, 3], -4)).toEqual({ minX: -2, minY: -1, maxX: 6, maxY: 7 });
  });
});

describe("bboxOfArc", () => {
  it("quarter arc (0 to π/2) hits only the start, end, and N extremum", () => {
    const b = bboxOfArc([0, 0], 1, 0, Math.PI / 2);
    // Start (1,0), end (0,1), and N extremum (0,1). No E,W,S in sweep.
    expect(b.maxX).toBeCloseTo(1, 9);
    expect(b.maxY).toBeCloseTo(1, 9);
    expect(b.minX).toBeCloseTo(0, 9);
    expect(b.minY).toBeCloseTo(0, 9);
  });

  it("full circle (0 to 2π) returns the circle's box", () => {
    const b = bboxOfArc([0, 0], 1, 0, TAU);
    expect(b.minX).toBeCloseTo(-1, 9);
    expect(b.maxX).toBeCloseTo(1, 9);
    expect(b.minY).toBeCloseTo(-1, 9);
    expect(b.maxY).toBeCloseTo(1, 9);
  });

  it("wrapped arc (3π/2 to π/2) includes the E extremum", () => {
    const b = bboxOfArc([0, 0], 1, (3 * Math.PI) / 2, Math.PI / 2);
    expect(b.maxX).toBeCloseTo(1, 9); // E extremum @ 0 rad lies in sweep
    expect(b.maxY).toBeCloseTo(1, 9); // N
    expect(b.minY).toBeCloseTo(-1, 9); // S = start
    expect(b.minX).toBeCloseTo(0, 9); // no W in sweep
  });
});

describe("bboxOfEllipse", () => {
  it("axis-aligned full ellipse matches its semi-axis lengths", () => {
    // Major axis along x with length 3, minor ratio 0.5 → minor length 1.5.
    const b = bboxOfEllipse([10, 20], [3, 0], 0.5, 0, TAU);
    expect(b.minX).toBeCloseTo(7, 9);
    expect(b.maxX).toBeCloseTo(13, 9);
    expect(b.minY).toBeCloseTo(18.5, 9);
    expect(b.maxY).toBeCloseTo(21.5, 9);
  });

  it("partial ellipse only sweeps the extrema inside its parameter range", () => {
    const b = bboxOfEllipse([0, 0], [2, 0], 1, 0, Math.PI / 2);
    // First-quadrant quarter ellipse → maxX 2, maxY 2.
    expect(b.maxX).toBeCloseTo(2, 9);
    expect(b.maxY).toBeCloseTo(2, 9);
  });
});

describe("bboxOfEntity dispatch", () => {
  it("routes each entity kind to its specialized helper", () => {
    const line = makeLine([0, 0], [4, 3]);
    expect(bboxOfEntity(line)).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 3 });

    const circle = makeCircle([1, 1], 2);
    expect(bboxOfEntity(circle)).toEqual({ minX: -1, minY: -1, maxX: 3, maxY: 3 });

    const arc = makeArc([0, 0], 1, 0, Math.PI / 2);
    const arcBox = bboxOfEntity(arc);
    expect(arcBox.maxX).toBeCloseTo(1, 9);

    const poly: PolylineEntity = {
      id: asId("x"),
      layerId: asId("L"),
      color: "byLayer",
      lineweight: "byLayer",
      kind: "polyline",
      vertices: [
        { p: [0, 0], bulge: 0 },
        { p: [5, 5], bulge: 0 },
      ],
      closed: false,
    };
    expect(bboxOfEntity(poly)).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 5 });

    const ell: EllipseEntity = {
      id: asId("x"),
      layerId: asId("L"),
      color: "byLayer",
      lineweight: "byLayer",
      kind: "ellipse",
      c: [0, 0],
      major: [2, 0],
      ratio: 1,
      startParam: 0,
      endParam: TAU,
    };
    const eb = bboxOfEntity(ell);
    expect(eb.minX).toBeCloseTo(-2, 9);

    const point: PointEntity = {
      id: asId("x"),
      layerId: asId("L"),
      color: "byLayer",
      lineweight: "byLayer",
      kind: "point",
      p: [9, 9],
    };
    expect(bboxOfEntity(point)).toEqual({ minX: 9, minY: 9, maxX: 9, maxY: 9 });

    const text: TextEntity = {
      id: asId("x"),
      layerId: asId("L"),
      color: "byLayer",
      lineweight: "byLayer",
      kind: "text",
      anchor: [3, 4],
      height: 2,
      rotation: 0,
      align: "bl",
      value: "hi",
      styleId: asId("s1"),
    };
    expect(bboxOfEntity(text)).toEqual({ minX: 3, minY: 4, maxX: 3, maxY: 4 });

    const dim: DimensionEntity = {
      id: asId("x"),
      layerId: asId("L"),
      color: "byLayer",
      lineweight: "byLayer",
      kind: "dimension",
      variant: "linear",
      refs: { variant: "linear", a: [0, 0], b: [10, 0], axis: "x" },
      offset: 5,
      styleId: asId("s1"),
    };
    expect(bboxOfEntity(dim)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it("throws on a malformed entity kind (defensive)", () => {
    const bogus = { kind: "nope" } as unknown as Entity;
    expect(() => bboxOfEntity(bogus)).toThrow(/unknown kind/);
  });
});

describe("bboxOfEntities", () => {
  it("returns empty-at-origin for an empty list", () => {
    expect(bboxOfEntities([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it("unions all entity boxes", () => {
    const a = makeLine([0, 0], [1, 1]);
    const b = makeCircle([10, 10], 1);
    expect(bboxOfEntities([a, b])).toEqual({ minX: 0, minY: 0, maxX: 11, maxY: 11 });
  });
});
