// T019 — Drawing add/remove/layer add/remove proven end-to-end through
// the CommandBus against the existing Drawing helpers.
import { describe, it, expect } from "vitest";
import { castDraft, type Draft } from "immer";
import { CommandBus, type Command } from "../../src/commands/CommandBus.js";
import { newDrawing, defaultLayer } from "../../src/scene/Drawing.js";
import { newId } from "../../src/ids.js";
import type { Drawing, Entity, LineEntity, Layer } from "../../src/scene/types.js";

function addEntityCmd(e: Entity): Command<{ entity: Entity }> {
  return {
    name: "test.addEntity",
    params: { entity: e },
    apply(draft: Draft<Drawing>) {
      draft.entities[e.id] = castDraft(e);
      draft.entityOrder.push(e.id);
    },
    inverse(draft: Draft<Drawing>) {
      delete draft.entities[e.id];
      const i = draft.entityOrder.indexOf(e.id);
      if (i >= 0) draft.entityOrder.splice(i, 1);
    },
  };
}

function removeEntityCmd(e: Entity): Command<{ id: string }> {
  return {
    name: "test.removeEntity",
    params: { id: e.id },
    apply(draft: Draft<Drawing>) {
      delete draft.entities[e.id];
      const i = draft.entityOrder.indexOf(e.id);
      if (i >= 0) draft.entityOrder.splice(i, 1);
    },
    inverse(draft: Draft<Drawing>) {
      draft.entities[e.id] = castDraft(e);
      draft.entityOrder.push(e.id);
    },
  };
}

function addLayerCmd(layer: Layer): Command<{ layer: Layer }> {
  return {
    name: "test.addLayer",
    params: { layer },
    apply(draft: Draft<Drawing>) {
      draft.layers.push(layer);
      draft.layerOrder.push(layer.id);
    },
    inverse(draft: Draft<Drawing>) {
      const li = draft.layers.findIndex((l) => l.id === layer.id);
      if (li >= 0) draft.layers.splice(li, 1);
      const oi = draft.layerOrder.indexOf(layer.id);
      if (oi >= 0) draft.layerOrder.splice(oi, 1);
    },
  };
}

function makeLine(layerId: string): LineEntity {
  return {
    id: newId(),
    kind: "line",
    layerId: layerId as LineEntity["layerId"],
    color: "byLayer",
    lineweight: "byLayer",
    a: [0, 0],
    b: [10, 0],
  };
}

describe("scene + CommandBus integration", () => {
  it("adds and removes an entity, undoable + redoable", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const line = makeLine(d.currentLayerId);
    const cmd = addEntityCmd(line);

    bus.execute(cmd);
    expect(bus.drawing.entityOrder).toHaveLength(1);
    expect(bus.drawing.entities[line.id]).toBeDefined();

    expect(bus.undo()).toBe(true);
    expect(bus.drawing.entityOrder).toHaveLength(0);
    expect(bus.drawing.entities[line.id]).toBeUndefined();

    expect(bus.redo()).toBe(true);
    expect(bus.drawing.entityOrder).toHaveLength(1);
  });

  it("removes an entity and undoes the removal", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const line = makeLine(d.currentLayerId);
    bus.execute(addEntityCmd(line));
    bus.execute(removeEntityCmd(line));
    expect(bus.drawing.entityOrder).toHaveLength(0);
    expect(bus.undo()).toBe(true);
    expect(bus.drawing.entityOrder).toHaveLength(1);
    expect(bus.drawing.entities[line.id]).toEqual(line);
  });

  it("adds a layer through the bus and undoes it", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const layer = defaultLayer();
    bus.execute(addLayerCmd(layer));
    expect(bus.drawing.layers).toHaveLength(2);
    expect(bus.drawing.layerOrder).toContain(layer.id);
    bus.undo();
    expect(bus.drawing.layers).toHaveLength(1);
    expect(bus.drawing.layerOrder).not.toContain(layer.id);
  });

  it("swaps an entity onto a different layer", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const other = defaultLayer();
    bus.execute(addLayerCmd(other));
    const line = makeLine(d.currentLayerId);
    bus.execute(addEntityCmd(line));

    const targetLayerId = other.id;
    const originalLayerId = line.layerId;
    const swapCmd: Command<{ id: string }> = {
      name: "test.swapLayer",
      params: { id: line.id },
      apply(draft: Draft<Drawing>) {
        const e = draft.entities[line.id];
        if (e) e.layerId = targetLayerId;
      },
      inverse(draft: Draft<Drawing>) {
        const e = draft.entities[line.id];
        if (e) e.layerId = originalLayerId;
      },
    };
    bus.execute(swapCmd);
    expect(bus.drawing.entities[line.id]?.layerId).toBe(targetLayerId);
    bus.undo();
    expect(bus.drawing.entities[line.id]?.layerId).toBe(originalLayerId);
  });

  it("clears the redo stack on a new committed action", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const a = makeLine(d.currentLayerId);
    const b = makeLine(d.currentLayerId);
    bus.execute(addEntityCmd(a));
    bus.execute(addEntityCmd(b));
    bus.undo();
    // there's something in redo
    expect(bus.drawing.entityOrder).toEqual([a.id]);
    const c = makeLine(d.currentLayerId);
    bus.execute(addEntityCmd(c));
    expect(bus.redo()).toBe(false);
    expect(bus.drawing.entityOrder).toEqual([a.id, c.id]);
  });

  it("undo on empty stack returns false", () => {
    const bus = new CommandBus(newDrawing());
    expect(bus.undo()).toBe(false);
    expect(bus.redo()).toBe(false);
  });

  it("frozen drawing snapshot — direct mutation throws", () => {
    const bus = new CommandBus(newDrawing());
    expect(() => {
      (bus.drawing as { units: string }).units = "in";
    }).toThrow();
  });

  it("freezes added entity records", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const line = makeLine(d.currentLayerId);
    bus.execute(addEntityCmd(line));
    const e = bus.drawing.entities[line.id]!;
    expect(Object.isFrozen(e)).toBe(true);
  });
});
