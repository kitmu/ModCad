// T086 — trim/extend command coverage.
//
// The COMMAND factories don't know about "Quick" vs "Classic" — that's
// the tool's job. They simply consume a target id, cut points, and a
// pick point. These tests verify that:
//   - identical cut input → identical commits, regardless of how the
//     tool computed the cuts (so Quick + Classic agree on the same
//     geometry).
//   - pickPoint selects which side of a 2-cut span to drop.
//   - extend moves only the chosen endpoint.
import { describe, it, expect } from "vitest";
import { CommandBus } from "../../src/commands/CommandBus.js";
import { newDrawing } from "../../src/scene/Drawing.js";
import { drawLineCommand } from "../../src/commands/draw/drawLine.js";
import { drawCircleCenterRadiusCommand } from "../../src/commands/draw/drawCircle.js";
import { trimCommand } from "../../src/commands/modify/trim.js";
import { extendCommand } from "../../src/commands/modify/extend.js";
import type { LineEntity } from "../../src/scene/types.js";

describe("modify.trim — line, single cut", () => {
  it("drops the half containing pickPoint, keeps the other half", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    // Cut at (5, 0); pick on the LEFT half (3,0) — should keep [5,10].
    bus.execute(
      trimCommand({ id, cutPoints: [[5, 0]], pickPoint: [3, 0] }),
    );
    expect(bus.drawing.entityOrder).toHaveLength(1);
    const kept = bus.drawing.entities[bus.drawing.entityOrder[0]!] as LineEntity;
    expect(kept.a).toEqual([5, 0]);
    expect(kept.b).toEqual([10, 0]);
  });

  it("Quick and Classic produce the same commit when geometry matches", () => {
    // Two perpendicular lines crossing at (5, 0). Trimming the
    // horizontal line at (5, 0) with cursor pick (3, 0) should produce
    // the same result whether the tool ran in Quick mode (auto-picked
    // the crossing) or in Classic mode (user selected the vertical line
    // as cutting edge and then the horizontal half to drop).
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 0] })); // horizontal
    const hId = bus.drawing.entityOrder[0]!;
    bus.execute(trimCommand({ id: hId, cutPoints: [[5, 0]], pickPoint: [3, 0] }));
    const quickKept = bus.drawing.entities[bus.drawing.entityOrder[0]!] as LineEntity;
    bus.undo();
    bus.execute(trimCommand({ id: hId, cutPoints: [[5, 0]], pickPoint: [3, 0] }));
    const classicKept = bus.drawing.entities[bus.drawing.entityOrder[0]!] as LineEntity;
    expect(classicKept.a).toEqual(quickKept.a);
    expect(classicKept.b).toEqual(quickKept.b);
  });

  it("undo restores the original line; redo re-applies the trim", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(trimCommand({ id, cutPoints: [[5, 0]], pickPoint: [3, 0] }));
    bus.undo();
    const restored = bus.drawing.entities[id] as LineEntity;
    expect(restored).toBeDefined();
    expect(restored.a).toEqual([0, 0]);
    expect(restored.b).toEqual([10, 0]);
    bus.redo();
    // After redo the original id is gone again.
    expect(bus.drawing.entities[id]).toBeUndefined();
    expect(bus.drawing.entityOrder).toHaveLength(1);
  });
});

describe("modify.trim — line, two cuts", () => {
  it("drops the middle span when pickPoint is between cuts", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(
      trimCommand({
        id,
        cutPoints: [[3, 0], [7, 0]],
        pickPoint: [5, 0],
      }),
    );
    expect(bus.drawing.entityOrder).toHaveLength(2);
    const survivors = bus.drawing.entityOrder
      .map((eid) => bus.drawing.entities[eid] as LineEntity)
      .sort((a, b) => a.a[0] - b.a[0]);
    expect(survivors[0]!.a).toEqual([0, 0]);
    expect(survivors[0]!.b).toEqual([3, 0]);
    expect(survivors[1]!.a).toEqual([7, 0]);
    expect(survivors[1]!.b).toEqual([10, 0]);
  });
});

describe("modify.trim — circle", () => {
  it("converts a circle to a single arc by cutting twice", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawCircleCenterRadiusCommand({ c: [0, 0], r: 5 }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(
      trimCommand({
        id,
        cutPoints: [[5, 0], [-5, 0]],
        pickPoint: [0, -5],
      }),
    );
    expect(bus.drawing.entityOrder).toHaveLength(1);
    const arc = bus.drawing.entities[bus.drawing.entityOrder[0]!];
    expect(arc?.kind).toBe("arc");
  });
});

describe("modify.extend", () => {
  it("moves a line endpoint to the targetPoint along the supporting line", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [5, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(
      extendCommand({ id, targetPoint: [10, 0], endpoint: "b" }),
    );
    const l = bus.drawing.entities[id] as LineEntity;
    expect(l.b).toEqual([10, 0]);
    bus.undo();
    const r = bus.drawing.entities[id] as LineEntity;
    expect(r.b).toEqual([5, 0]);
  });
});
