// PDF writer smoke tests. We don't validate the full PDF binary — just
// confirm the producer emits the magic header, OCG dictionaries for
// every layer, and survives the entity set we support.
import { describe, it } from "vitest";
import {
  newDrawing,
  newId,
  asId,
  type CircleEntity,
  type Drawing,
  type LineEntity,
  type TextEntity,
} from "@modcad/core";
import { writePdf } from "../src/pdf/write.js";

function makeMixed(): Drawing {
  const d = newDrawing();
  const layer0Id = d.currentLayerId;
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
  const entities = [
    { id: newId(), layerId: asId(layer0Id), color: "byLayer", lineweight: "byLayer",
      kind: "line", a: [0, 0], b: [10, 0] } satisfies LineEntity,
    { id: newId(), layerId: wallsId, color: "byLayer", lineweight: "byLayer",
      kind: "circle", c: [5, 5], r: 2 } satisfies CircleEntity,
    { id: newId(), layerId: asId(layer0Id), color: "byLayer", lineweight: "byLayer",
      kind: "text", anchor: [1, 1], height: 1, rotation: 0,
      align: "bl", value: "Test", styleId: asId("STANDARD") } satisfies TextEntity,
  ];
  for (const e of entities) {
    d.entities[e.id] = e;
    d.entityOrder.push(e.id);
  }
  return d;
}

describe("pdf writer", () => {
  it("emits %PDF- header, OCProperties catalog entry, and one OCG per layer", async () => {
    const d = makeMixed();
    const bytes = await writePdf(d, { paperSize: "A4" });
    const text = new TextDecoder("latin1").decode(bytes);
    if (!text.startsWith("%PDF-")) throw new Error("missing %PDF- header");
    // OCProperties lives in the catalog dictionary; with object streams
    // disabled it's plain-text searchable. The /OC entries reference
    // the per-layer OCG dictionaries we register in writePdf.
    if (!text.includes("/OCProperties")) {
      throw new Error("missing OCProperties in catalog");
    }
    if (!text.includes("/OCGs")) {
      throw new Error("missing OCGs array in catalog");
    }
    // Each OCG dict is tagged /Type /OCG. We register one per layer (2 here).
    const ocgMatches = text.match(/\/Type\s*\/OCG\b/g) ?? [];
    if (ocgMatches.length < 2) {
      throw new Error(`expected >=2 OCG type entries, got ${ocgMatches.length}`);
    }
  });

  it("accepts a custom paper size and landscape orientation", async () => {
    const d = makeMixed();
    const bytes = await writePdf(d, {
      paperSize: [200, 100],
      orientation: "landscape",
    });
    const text = new TextDecoder("latin1").decode(bytes);
    if (!text.startsWith("%PDF-")) throw new Error("missing %PDF- header");
  });
});
