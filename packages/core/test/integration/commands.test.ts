// T022 — CommandBus execute / undo / redo basic correctness.
import { describe, it, expect } from "vitest";
import type { Draft } from "immer";
import { CommandBus, type Command } from "../../src/commands/CommandBus.js";
import { newDrawing } from "../../src/scene/Drawing.js";
import type { Drawing } from "../../src/scene/types.js";

function setPrecisionCmd(next: number, prev: number): Command<{ next: number }> {
  return {
    name: "test.setPrecision",
    params: { next },
    apply(d: Draft<Drawing>) {
      d.precision = next;
    },
    inverse(d: Draft<Drawing>) {
      d.precision = prev;
    },
  };
}

describe("CommandBus execute / undo / redo", () => {
  it("execute mutates the snapshot via the draft", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    bus.execute(setPrecisionCmd(5, d.precision));
    expect(bus.drawing.precision).toBe(5);
    expect(bus.drawing).not.toBe(d);
  });

  it("undo reverts the last commit", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    bus.execute(setPrecisionCmd(5, d.precision));
    expect(bus.undo()).toBe(true);
    expect(bus.drawing.precision).toBe(d.precision);
  });

  it("redo re-applies an undone commit", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    bus.execute(setPrecisionCmd(5, d.precision));
    bus.undo();
    expect(bus.redo()).toBe(true);
    expect(bus.drawing.precision).toBe(5);
  });

  it("structurally shares unchanged subtrees across snapshots", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const before = bus.drawing;
    bus.execute(setPrecisionCmd(5, d.precision));
    // settings was not touched by the command → same reference
    expect(bus.drawing.settings).toBe(before.settings);
  });
});
