// Property test: random Drawing → write → read → structurally equal.
import { describe, it } from "vitest";
import fc from "fast-check";
import { gzip } from "pako";
import {
  newDrawing,
  newId,
  asId,
  type ArcEntity,
  type CircleEntity,
  type Drawing,
  type Entity,
  type LineEntity,
  type PointEntity,
  type PolylineEntity,
} from "@modcad/core";
import { writeModcad } from "../src/modcad/write.js";
import { readModcad } from "../src/modcad/read.js";

const arbFiniteNum = fc.double({
  min: -1e6,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});
const arbVec2 = fc.tuple(arbFiniteNum, arbFiniteNum);

function arbEntity(layerId: string): fc.Arbitrary<Entity> {
  const base = {
    id: newId(),
    layerId: asId(layerId),
    color: "byLayer" as const,
    lineweight: "byLayer" as const,
  };
  const line: fc.Arbitrary<LineEntity> = fc
    .tuple(arbVec2, arbVec2)
    .map(([a, b]) => ({ ...base, id: newId(), kind: "line", a, b }));
  const circle: fc.Arbitrary<CircleEntity> = fc
    .tuple(arbVec2, fc.double({ min: 0.001, max: 1e5, noNaN: true }))
    .map(([c, r]) => ({ ...base, id: newId(), kind: "circle", c, r }));
  const arc: fc.Arbitrary<ArcEntity> = fc
    .tuple(
      arbVec2,
      fc.double({ min: 0.001, max: 1e5, noNaN: true }),
      arbFiniteNum,
      arbFiniteNum,
    )
    .map(([c, r, s, e]) => ({
      ...base,
      id: newId(),
      kind: "arc",
      c,
      r,
      startAngle: s,
      endAngle: e,
    }));
  const point: fc.Arbitrary<PointEntity> = arbVec2.map((p) => ({
    ...base,
    id: newId(),
    kind: "point",
    p,
  }));
  const polyline: fc.Arbitrary<PolylineEntity> = fc
    .tuple(
      fc.array(
        fc.tuple(arbVec2, arbFiniteNum).map(([p, bulge]) => ({ p, bulge })),
        { minLength: 2, maxLength: 6 },
      ),
      fc.boolean(),
    )
    .map(([vertices, closed]) => ({
      ...base,
      id: newId(),
      kind: "polyline",
      vertices,
      closed,
    }));
  return fc.oneof(line, circle, arc, point, polyline);
}

function arbDrawing(): fc.Arbitrary<Drawing> {
  return fc
    .array(fc.constant(0), { minLength: 1, maxLength: 20 })
    .chain((slots) => {
      const d = newDrawing();
      const layerId = d.currentLayerId;
      return fc
        .tuple(...slots.map(() => arbEntity(layerId)))
        .map((entities) => {
          for (const e of entities) {
            d.entities[e.id] = e;
            d.entityOrder.push(e.id);
          }
          return d;
        });
    });
}

describe("modcad codec round-trip", () => {
  it("preserves drawings structurally over write→read (100 cases)", () => {
    fc.assert(
      fc.property(arbDrawing(), (d) => {
        const bytes = writeModcad(d);
        const { drawing } = readModcad(bytes);
        if (JSON.stringify(drawing) !== JSON.stringify(d)) {
          throw new Error("round-trip mismatch");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("preserves unknown top-level envelope fields in `extra`", () => {
    const d = newDrawing();
    const bytes = writeModcad(d, { author: "test", schemaHint: 7 });
    const { extra } = readModcad(bytes);
    if (extra["author"] !== "test" || extra["schemaHint"] !== 7) {
      throw new Error("extra not preserved");
    }
  });

  it("throws on missing format discriminator", () => {
    const tampered = gzip('{"version":"1.0","drawing":{}}');
    let msg: string | undefined;
    try {
      readModcad(tampered);
    } catch (e) {
      msg = (e as Error).message;
    }
    if (msg !== "not a modcad file") {
      throw new Error(`expected 'not a modcad file' error, got: ${msg}`);
    }
  });
});
