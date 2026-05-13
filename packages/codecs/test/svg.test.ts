// SVG writer smoke tests. Asserts the structural invariants the UI relies
// on: one <g> per layer, every entity carries data-modcad-id, viewBox in
// drawing units.
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
import { writeSvg } from "../src/svg/write.js";

function makeMixedDrawing(): Drawing {
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
    {
      id: newId(), layerId: asId(layer0Id), color: "byLayer", lineweight: "byLayer",
      kind: "line", a: [0, 0], b: [10, 0],
    } satisfies LineEntity,
    {
      id: newId(), layerId: wallsId, color: "byLayer", lineweight: "byLayer",
      kind: "circle", c: [5, 5], r: 1,
    } satisfies CircleEntity,
    {
      id: newId(), layerId: asId(layer0Id), color: "byLayer", lineweight: "byLayer",
      kind: "text", anchor: [1, 1], height: 1, rotation: 0,
      align: "bl", value: "hi", styleId: asId("STANDARD"),
    } satisfies TextEntity,
  ];
  for (const e of entities) {
    d.entities[e.id] = e;
    d.entityOrder.push(e.id);
  }
  return d;
}

describe("svg writer", () => {
  it("emits one <g> per layer and data-modcad-id on every entity", () => {
    const d = makeMixedDrawing();
    const svg = writeSvg(d);
    if (!svg.startsWith("<svg ")) throw new Error("missing <svg> prefix");
    const layerGs = svg.match(/<g data-modcad-layer="/g) ?? [];
    if (layerGs.length !== d.layers.length) {
      throw new Error(`expected ${d.layers.length} layer <g>, got ${layerGs.length}`);
    }
    for (const id of d.entityOrder) {
      if (!svg.includes(`data-modcad-id="${id}"`)) {
        throw new Error(`missing data-modcad-id for ${id}`);
      }
    }
    if (!svg.includes("viewBox=")) throw new Error("missing viewBox");
  });

  it("escapes XML in text values", () => {
    const d = newDrawing();
    const layerId = d.currentLayerId;
    const text: TextEntity = {
      id: newId(), layerId: asId(layerId), color: "byLayer", lineweight: "byLayer",
      kind: "text", anchor: [0, 0], height: 1, rotation: 0,
      align: "bl", value: "<a&b>", styleId: asId("STANDARD"),
    };
    d.entities[text.id] = text;
    d.entityOrder.push(text.id);
    const svg = writeSvg(d);
    if (!svg.includes("&lt;a&amp;b&gt;")) throw new Error("xml not escaped");
  });
});
