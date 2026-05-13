// T072 — US3 layer command integration: visibility filtering, deletion
// with reassign + undo, locked/default-layer deletion refusal, byLayer
// color/lineweight resolution.
import { describe, it, expect } from "vitest";
import { CommandBus } from "../../src/commands/CommandBus.js";
import { newDrawing } from "../../src/scene/Drawing.js";
import { listVisibleEntities } from "../../src/scene/Drawing.js";
import { drawLineCommand } from "../../src/commands/draw/drawLine.js";
import { addLayerCommand } from "../../src/commands/layers/addLayer.js";
import { removeLayerCommand } from "../../src/commands/layers/removeLayer.js";
import {
  setLayerVisibleCommand,
  setLayerLockedCommand,
} from "../../src/commands/layers/setLayerFlag.js";
import { setLayerColorCommand } from "../../src/commands/layers/setLayerColor.js";
import { setLayerLineweightCommand } from "../../src/commands/layers/setLayerLineweight.js";
import { setCurrentLayerCommand } from "../../src/commands/layers/setCurrentLayer.js";
import {
  LayerLockedError,
  UndeletableLayerError,
} from "../../src/commands/layers/errors.js";
import {
  effectiveColor,
  effectiveLineweight,
} from "../../src/scene/effectiveStyle.js";

const RED = { r: 1, g: 0, b: 0, a: 1 };
const GREEN = { r: 0, g: 1, b: 0, a: 1 };
const BLUE = { r: 0, g: 0, b: 1, a: 1 };

describe("US3 — layer commands", () => {
  it("toggling layer visibility filters listVisibleEntities", () => {
    const bus = new CommandBus(newDrawing());
    const lA = addLayerCommand({ name: "walls", color: RED, lineweight: 0.5 });
    const lB = addLayerCommand({ name: "doors", color: GREEN, lineweight: 0.25 });
    const lC = addLayerCommand({ name: "notes", color: BLUE, lineweight: 0.18 });
    bus.execute(lA);
    bus.execute(lB);
    bus.execute(lC);

    // Draw one entity on each layer.
    bus.execute(drawLineCommand({ a: [0, 0], b: [1, 0], layerId: lA.id }));
    bus.execute(drawLineCommand({ a: [0, 1], b: [1, 1], layerId: lB.id }));
    bus.execute(drawLineCommand({ a: [0, 2], b: [1, 2], layerId: lC.id }));

    expect(listVisibleEntities(bus.drawing)).toHaveLength(3);

    // Hide layer B.
    bus.execute(setLayerVisibleCommand({ id: lB.id, value: false }, bus.drawing));
    const visible = listVisibleEntities(bus.drawing);
    expect(visible).toHaveLength(2);
    expect(visible.every((e) => e.layerId !== lB.id)).toBe(true);

    // Re-show.
    bus.execute(setLayerVisibleCommand({ id: lB.id, value: true }, bus.drawing));
    expect(listVisibleEntities(bus.drawing)).toHaveLength(3);
  });

  it("removing a layer reassigns its entities and undoes cleanly", () => {
    const bus = new CommandBus(newDrawing());
    const target = addLayerCommand({ name: "scratch", color: RED, lineweight: 0.25 });
    const dest = addLayerCommand({ name: "keep", color: GREEN, lineweight: 0.25 });
    bus.execute(target);
    bus.execute(dest);
    const line = drawLineCommand({ a: [0, 0], b: [1, 1], layerId: target.id });
    bus.execute(line);
    const entityId = bus.drawing.entityOrder[0]!;
    expect(bus.drawing.entities[entityId]?.layerId).toBe(target.id);

    bus.execute(
      removeLayerCommand({ id: target.id, reassignTo: dest.id }, bus.drawing),
    );
    expect(bus.drawing.layers.some((l) => l.id === target.id)).toBe(false);
    expect(bus.drawing.entities[entityId]?.layerId).toBe(dest.id);

    // Undo restores both layer record and entity assignment.
    bus.undo();
    expect(bus.drawing.layers.some((l) => l.id === target.id)).toBe(true);
    expect(bus.drawing.entities[entityId]?.layerId).toBe(target.id);
  });

  it("refuses to delete a locked layer (LayerLockedError); drawing unchanged", () => {
    const bus = new CommandBus(newDrawing());
    const locked = addLayerCommand({ name: "locked", color: RED, lineweight: 0.25 });
    const dest = addLayerCommand({ name: "keep", color: GREEN, lineweight: 0.25 });
    bus.execute(locked);
    bus.execute(dest);
    bus.execute(setLayerLockedCommand({ id: locked.id, value: true }, bus.drawing));
    const before = bus.drawing;

    expect(() =>
      removeLayerCommand({ id: locked.id, reassignTo: dest.id }, bus.drawing),
    ).toThrow(LayerLockedError);
    // Drawing snapshot identical (no mutation occurred).
    expect(bus.drawing).toBe(before);
  });

  it("refuses to delete the default '0' layer (UndeletableLayerError)", () => {
    const bus = new CommandBus(newDrawing());
    const dest = addLayerCommand({ name: "keep", color: GREEN, lineweight: 0.25 });
    bus.execute(dest);
    const zero = bus.drawing.layers.find((l) => l.name === "0")!;
    expect(() =>
      removeLayerCommand({ id: zero.id, reassignTo: dest.id }, bus.drawing),
    ).toThrow(UndeletableLayerError);
  });

  it("byLayer color/lineweight: changing a layer changes resolved style", () => {
    const bus = new CommandBus(newDrawing());
    const layer = addLayerCommand({ name: "walls", color: RED, lineweight: 0.5 });
    bus.execute(layer);
    bus.execute(setCurrentLayerCommand({ id: layer.id }, bus.drawing));
    bus.execute(drawLineCommand({ a: [0, 0], b: [1, 0] }));
    const entityId = bus.drawing.entityOrder[0]!;
    let entity = bus.drawing.entities[entityId]!;
    expect(entity.color).toBe("byLayer");
    expect(effectiveColor(entity, bus.drawing)).toEqual(RED);
    expect(effectiveLineweight(entity, bus.drawing)).toBe(0.5);

    bus.execute(setLayerColorCommand({ id: layer.id, color: BLUE }, bus.drawing));
    bus.execute(
      setLayerLineweightCommand({ id: layer.id, lineweight: 0.18 }, bus.drawing),
    );
    entity = bus.drawing.entities[entityId]!;
    expect(effectiveColor(entity, bus.drawing)).toEqual(BLUE);
    expect(effectiveLineweight(entity, bus.drawing)).toBe(0.18);
  });
});
