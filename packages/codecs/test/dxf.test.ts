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

function dxfBlock(...groups: Array<string | number>): string {
  // Helper: build a DXF text from (code, value) pairs.
  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += 2) {
    lines.push(String(groups[i]));
    lines.push(String(groups[i + 1]));
  }
  return lines.join("\n") + "\n";
}

function wrapEntities(entities: string): string {
  // Wrap raw entity-group text in minimal SECTION TABLES/ENTITIES envelope.
  return [
    "0\nSECTION\n2\nHEADER\n0\nENDSEC",
    "0\nSECTION\n2\nTABLES",
    "0\nTABLE\n2\nLAYER\n70\n1\n0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n370\n25\n0\nENDTAB",
    "0\nENDSEC",
    "0\nSECTION\n2\nENTITIES",
    entities.trim(),
    "0\nENDSEC",
    "0\nEOF",
    "",
  ].join("\n");
}

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

describe("dxf reader — expanded entity coverage", () => {
  it("parses TEXT with alignment + style", () => {
    const dxf = wrapEntities(
      dxfBlock(
        0, "TEXT",
        8, "0",
        10, 1.0,
        20, 2.0,
        40, 2.5,
        1, "hello",
        50, 90,
        7, "ARIAL",
        72, 1,
        73, 2,
      ),
    );
    const { drawing, warnings } = readDxf(dxf);
    if (warnings.length !== 0) throw new Error(`unexpected: ${JSON.stringify(warnings)}`);
    const e = drawing.entityOrder.map((id) => drawing.entities[id])[0];
    if (!e || e.kind !== "text") throw new Error("text not parsed");
    if (e.value !== "hello") throw new Error(`value: ${e.value}`);
    if (e.height !== 2.5) throw new Error(`height: ${e.height}`);
    if (Math.abs(e.rotation - Math.PI / 2) > 1e-9) throw new Error(`rotation: ${e.rotation}`);
    if (e.align !== "mc") throw new Error(`align: ${e.align}`);
  });

  it("parses MTEXT, strips formatting, emits a warning", () => {
    const dxf = wrapEntities(
      dxfBlock(
        0, "MTEXT",
        8, "0",
        10, 0.0,
        20, 0.0,
        40, 1.0,
        71, 1,
        1, "\\C1;hot \\Pline2",
        7, "STANDARD",
      ),
    );
    const { drawing, warnings } = readDxf(dxf);
    const e = drawing.entityOrder.map((id) => drawing.entities[id])[0];
    if (!e || e.kind !== "text") throw new Error("mtext not parsed");
    if (e.value !== "hot \nline2") throw new Error(`mtext value: ${JSON.stringify(e.value)}`);
    const fmt = warnings.find((w) => w.kind === "mtext-formatting-stripped");
    if (!fmt) throw new Error("expected mtext-formatting-stripped warning");
  });

  it("parses DIMENSION with linear variant + emits unresolved-ref warning", () => {
    const dxf = wrapEntities(
      dxfBlock(
        0, "DIMENSION",
        8, "0",
        10, 5.0, 20, 8.0,
        11, 5.0, 21, 8.0,
        13, 0.0, 23, 0.0,
        14, 10.0, 24, 0.0,
        70, 0,
        3, "STANDARD",
        50, 0,
      ),
    );
    const { drawing, warnings } = readDxf(dxf);
    const e = drawing.entityOrder.map((id) => drawing.entities[id])[0];
    if (!e || e.kind !== "dimension") throw new Error("dimension not parsed");
    if (e.variant !== "linear") throw new Error(`variant: ${e.variant}`);
    if (!warnings.some((w) => w.kind === "unresolved-dimension-ref"))
      throw new Error("expected unresolved-dimension-ref warning");
  });

  it("parses legacy POLYLINE → VERTEX → SEQEND into a polyline entity", () => {
    const dxf = wrapEntities(
      [
        "0\nPOLYLINE\n8\n0\n66\n1\n70\n0",
        "0\nVERTEX\n8\n0\n10\n0.0\n20\n0.0",
        "0\nVERTEX\n8\n0\n10\n5.0\n20\n0.0\n42\n0.5",
        "0\nVERTEX\n8\n0\n10\n10.0\n20\n5.0",
        "0\nSEQEND",
      ].join("\n"),
    );
    const { drawing, warnings } = readDxf(dxf);
    if (warnings.length !== 0) throw new Error(`unexpected: ${JSON.stringify(warnings)}`);
    const e = drawing.entityOrder.map((id) => drawing.entities[id])[0];
    if (!e || e.kind !== "polyline") throw new Error("polyline not parsed");
    if (e.vertices.length !== 3) throw new Error(`vertices: ${e.vertices.length}`);
    if (e.vertices[1]?.bulge !== 0.5) throw new Error(`bulge: ${e.vertices[1]?.bulge}`);
  });

  it("parses ELLIPSE with major axis + parameter range", () => {
    const dxf = wrapEntities(
      dxfBlock(
        0, "ELLIPSE",
        8, "0",
        10, 1.0, 20, 2.0,
        11, 3.0, 21, 0.0,
        40, 0.5,
        41, 0.0,
        42, 6.283185307,
      ),
    );
    const { drawing, warnings } = readDxf(dxf);
    if (warnings.length !== 0) throw new Error(`unexpected: ${JSON.stringify(warnings)}`);
    const e = drawing.entityOrder.map((id) => drawing.entities[id])[0];
    if (!e || e.kind !== "ellipse") throw new Error("ellipse not parsed");
    if (e.c[0] !== 1 || e.c[1] !== 2) throw new Error(`center: ${e.c.toString()}`);
    if (e.major[0] !== 3 || e.major[1] !== 0) throw new Error(`major: ${e.major.toString()}`);
    if (e.ratio !== 0.5) throw new Error(`ratio: ${e.ratio}`);
  });

  it("emits unsupported-entity warning for unknown entity types", () => {
    const dxf = wrapEntities(
      dxfBlock(
        0, "SPLINE", 8, "0", 10, 0.0, 20, 0.0,
      ),
    );
    const { warnings } = readDxf(dxf);
    const u = warnings.find((w) => w.kind === "unsupported-entity");
    if (!u) throw new Error("expected unsupported-entity warning");
  });
});
