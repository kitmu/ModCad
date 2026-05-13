// Golden round-trip: build a drawing with one of every supported entity,
// write it as DXF, read it back, and assert structural equality.
//
// The dimension entity uses a Vec2-only reference because the writer
// can't preserve entity references without DXF handles (the reader
// always re-emits an `unresolved-dimension-ref` warning, which the
// golden assertion below tolerates).
import { describe, it } from "vitest";
import {
  newDrawing,
  newId,
  asId,
  type ArcEntity,
  type CircleEntity,
  type DimensionEntity,
  type Drawing,
  type EllipseEntity,
  type Entity,
  type LineEntity,
  type PointEntity,
  type PolylineEntity,
  type TextEntity,
} from "@modcad/core";
import { readDxf } from "../src/dxf/read.js";
import { writeDxf } from "../src/dxf/write.js";

function makeAllEntitiesDrawing(): Drawing {
  const d = newDrawing();
  const layerId = d.currentLayerId;
  const base = {
    layerId: asId(layerId),
    color: "byLayer" as const,
    lineweight: "byLayer" as const,
  };

  const line: LineEntity = { ...base, id: newId(), kind: "line", a: [0, 0], b: [10, 0] };
  const circle: CircleEntity = { ...base, id: newId(), kind: "circle", c: [5, 5], r: 2.5 };
  const arc: ArcEntity = {
    ...base, id: newId(), kind: "arc",
    c: [0, 0], r: 1, startAngle: 0, endAngle: Math.PI,
  };
  const point: PointEntity = { ...base, id: newId(), kind: "point", p: [3, 4] };
  const polyline: PolylineEntity = {
    ...base, id: newId(), kind: "polyline",
    vertices: [
      { p: [0, 0], bulge: 0 },
      { p: [4, 0], bulge: 0.25 },
      { p: [4, 4], bulge: 0 },
    ],
    closed: false,
  };
  const ellipse: EllipseEntity = {
    ...base, id: newId(), kind: "ellipse",
    c: [10, 10], major: [2, 0], ratio: 0.5, startParam: 0, endParam: Math.PI * 2,
  };
  const text: TextEntity = {
    ...base, id: newId(), kind: "text",
    anchor: [1, 2], height: 0.5, rotation: 0, align: "bl",
    value: "Hi", styleId: asId("STANDARD"),
  };
  const mtext: TextEntity = {
    ...base, id: newId(), kind: "text",
    anchor: [1, 5], height: 0.5, rotation: 0, align: "tl",
    // Newline forces the writer to emit MTEXT.
    value: "two\nlines", styleId: asId("STANDARD"),
  };
  const dimension: DimensionEntity = {
    ...base, id: newId(), kind: "dimension", variant: "linear",
    refs: { variant: "linear", a: [0, 0], b: [10, 0], axis: "x" },
    offset: 2, styleId: asId("STANDARD"),
  };

  const all: Entity[] = [line, circle, arc, point, polyline, ellipse, text, mtext, dimension];
  for (const e of all) {
    d.entities[e.id] = e;
    d.entityOrder.push(e.id);
  }
  return d;
}

function normaliseEntity(e: Entity): Record<string, unknown> {
  switch (e.kind) {
    case "line":
      return { kind: e.kind, a: e.a, b: e.b };
    case "circle":
      return { kind: e.kind, c: e.c, r: e.r };
    case "arc":
      return {
        kind: e.kind, c: e.c, r: e.r,
        startAngle: Math.round(e.startAngle * 1e6) / 1e6,
        endAngle: Math.round(e.endAngle * 1e6) / 1e6,
      };
    case "point":
      return { kind: e.kind, p: e.p };
    case "polyline":
      return {
        kind: e.kind, closed: e.closed,
        vertices: e.vertices.map((v) => ({ p: v.p, bulge: v.bulge })),
      };
    case "ellipse":
      return {
        kind: e.kind, c: e.c, major: e.major, ratio: e.ratio,
        startParam: e.startParam, endParam: e.endParam,
      };
    case "text":
      return {
        kind: e.kind, anchor: e.anchor, height: e.height,
        rotation: Math.round(e.rotation * 1e6) / 1e6,
        align: e.align, value: e.value,
      };
    case "dimension":
      return { kind: e.kind, variant: e.variant };
  }
}

describe("dxf golden round-trip", () => {
  it("writes one of every supported entity and reads back structurally equal", () => {
    const original = makeAllEntitiesDrawing();
    const dxf = writeDxf(original);
    const { drawing: round, warnings } = readDxf(dxf);

    // The dimension reader always emits one unresolved-dimension-ref;
    // anything else (unsupported, missing-font) means we regressed.
    const unexpected = warnings.filter(
      (w) => w.kind !== "unresolved-dimension-ref",
    );
    if (unexpected.length !== 0) {
      throw new Error(`unexpected warnings: ${JSON.stringify(unexpected)}`);
    }

    const origEntities = original.entityOrder.map((id) => original.entities[id]!);
    const roundEntities = round.entityOrder.map((id) => round.entities[id]!);
    if (origEntities.length !== roundEntities.length) {
      throw new Error(
        `count mismatch: orig=${origEntities.length} round=${roundEntities.length}`,
      );
    }
    for (let i = 0; i < origEntities.length; i += 1) {
      const a = JSON.stringify(normaliseEntity(origEntities[i]!));
      const b = JSON.stringify(normaliseEntity(roundEntities[i]!));
      if (a !== b) {
        throw new Error(`entity ${i} mismatch:\n  orig=${a}\n  round=${b}`);
      }
    }
  });
});
