// DXF reader/writer round-trip on the supported subset.
import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  newDrawing,
  newId,
  asId,
  type CircleEntity,
  type Drawing,
  type LineEntity,
} from "@modcad/core";
import { readDxf } from "../src/dxf/read.js";
import { writeDxf } from "../src/dxf/write.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDxf = resolve(here, "../../../fixtures/dxf/sample.dxf");

function makeFixtureDrawing(): Drawing {
  const d = newDrawing();
  const layer0Id = d.currentLayerId;
  // Add a custom layer "WALLS".
  const wallsId = newId();
  d.layers.push({
    id: wallsId,
    name: "WALLS",
    color: { r: 1, g: 0, b: 0, a: 1 },
    lineweight: 0.5,
    visible: true,
    locked: false,
    frozen: false,
  });
  d.layerOrder.push(wallsId);

  const lines: LineEntity[] = [
    {
      id: newId(),
      layerId: asId(layer0Id),
      color: "byLayer",
      lineweight: "byLayer",
      kind: "line",
      a: [0, 0],
      b: [10, 0],
    },
    {
      id: newId(),
      layerId: asId(layer0Id),
      color: "byLayer",
      lineweight: "byLayer",
      kind: "line",
      a: [10, 0],
      b: [10, 5],
    },
    {
      id: newId(),
      layerId: wallsId,
      color: "byLayer",
      lineweight: "byLayer",
      kind: "line",
      a: [0, 0],
      b: [0, 5],
    },
  ];
  const circles: CircleEntity[] = [
    {
      id: newId(),
      layerId: asId(layer0Id),
      color: "byLayer",
      lineweight: "byLayer",
      kind: "circle",
      c: [5, 2.5],
      r: 1.25,
    },
    {
      id: newId(),
      layerId: wallsId,
      color: "byLayer",
      lineweight: "byLayer",
      kind: "circle",
      c: [3, 3],
      r: 0.75,
    },
  ];
  for (const e of [...lines, ...circles]) {
    d.entities[e.id] = e;
    d.entityOrder.push(e.id);
  }
  return d;
}

describe("dxf round-trip", () => {
  it("reads the hand-written sample fixture", () => {
    const text = readFileSync(fixtureDxf, "utf8");
    const { drawing, warnings } = readDxf(text);
    if (warnings.length !== 0) {
      throw new Error(`unexpected warnings: ${JSON.stringify(warnings)}`);
    }
    const entities = drawing.entityOrder.map((id) => drawing.entities[id]);
    const kinds = entities.map((e) => e?.kind);
    if (
      kinds.length !== 2 ||
      kinds[0] !== "line" ||
      kinds[1] !== "circle"
    ) {
      throw new Error(`unexpected entities: ${JSON.stringify(kinds)}`);
    }
    const layer0 = drawing.layers.find((l) => l.name === "0");
    if (!layer0) throw new Error("layer '0' missing");
  });

  it("round-trips a known drawing (3 lines, 2 circles, 2 layers)", () => {
    const original = makeFixtureDrawing();
    const dxf = writeDxf(original);
    const { drawing: round, warnings } = readDxf(dxf);
    if (warnings.length !== 0) {
      throw new Error(`unexpected warnings: ${JSON.stringify(warnings)}`);
    }
    // Layer names round-trip.
    const layerNames = round.layers.map((l) => l.name).sort();
    const expected = ["0", "WALLS"].sort();
    if (JSON.stringify(layerNames) !== JSON.stringify(expected)) {
      throw new Error(
        `layer mismatch: got ${JSON.stringify(layerNames)}, want ${JSON.stringify(
          expected,
        )}`,
      );
    }
    // Entities structurally equal modulo ids and layerId remapping.
    const flatten = (d: Drawing) =>
      d.entityOrder
        .map((id) => d.entities[id])
        .map((e) => {
          if (!e) return null;
          const layerName = d.layers.find((l) => l.id === e.layerId)?.name;
          if (e.kind === "line") {
            return { kind: e.kind, layerName, a: e.a, b: e.b };
          }
          if (e.kind === "circle") {
            return { kind: e.kind, layerName, c: e.c, r: e.r };
          }
          return { kind: e.kind, layerName };
        });
    const a = JSON.stringify(flatten(original));
    const b = JSON.stringify(flatten(round));
    if (a !== b) {
      throw new Error(`round-trip mismatch:\n  orig=${a}\n  round=${b}`);
    }
  });
});
