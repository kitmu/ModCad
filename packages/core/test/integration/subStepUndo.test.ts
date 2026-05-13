// T024 — sub-step undo (FR-006a). Begin a polyline command, push 3
// vertex sub-steps, undoStep twice, commit. The committed polyline
// must have 1 vertex; redo after commit goes back to the committed
// state, not the intermediate sub-step state. Escape after pushing 2
// sub-steps cancels cleanly.
import { describe, it, expect } from "vitest";
import { castDraft, type Draft } from "immer";
import { CommandBus, type Command, type SubStep } from "../../src/commands/CommandBus.js";
import { newDrawing } from "../../src/scene/Drawing.js";
import { newId, type Id } from "../../src/ids.js";
import type { Drawing, PolylineEntity, Vec2Type } from "../../src/index.js";

function beginPolyline(id: Id, layerId: Id): Command<{ id: Id }> {
  return {
    name: "draw.polyline",
    params: { id },
    apply(draft: Draft<Drawing>) {
      // Allocate fresh on every apply — the same Command may be
      // re-applied on redo, and we MUST NOT share a frozen reference
      // between snapshots (the second redo would try to push into a
      // frozen vertices array).
      const initial: PolylineEntity = {
        id,
        kind: "polyline",
        layerId,
        color: "byLayer",
        lineweight: "byLayer",
        vertices: [],
        closed: false,
      };
      draft.entities[id] = castDraft(initial);
      draft.entityOrder.push(id);
    },
    inverse(draft: Draft<Drawing>) {
      delete draft.entities[id];
      const i = draft.entityOrder.indexOf(id);
      if (i >= 0) draft.entityOrder.splice(i, 1);
    },
  };
}

function addVertex(id: Id, p: Vec2Type): SubStep {
  return {
    apply(draft: Draft<Drawing>) {
      const e = draft.entities[id];
      if (e && e.kind === "polyline") e.vertices.push(castDraft({ p, bulge: 0 }));
    },
    inverse(draft: Draft<Drawing>) {
      const e = draft.entities[id];
      if (e && e.kind === "polyline") e.vertices.pop();
    },
  };
}

describe("sub-step undo (FR-006a)", () => {
  it("commits a polyline with 1 vertex after 3 pushes and 2 undoSteps", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const pid = newId();
    bus.beginCommand(beginPolyline(pid, d.currentLayerId));
    bus.pushSubStep(addVertex(pid, [0, 0]));
    bus.pushSubStep(addVertex(pid, [10, 0]));
    bus.pushSubStep(addVertex(pid, [10, 10]));

    let e = bus.drawing.entities[pid] as PolylineEntity;
    expect(e.vertices).toHaveLength(3);

    expect(bus.undoStep()).toBe(true);
    expect(bus.undoStep()).toBe(true);

    e = bus.drawing.entities[pid] as PolylineEntity;
    expect(e.vertices).toHaveLength(1);
    expect(e.vertices[0]?.p).toEqual([0, 0]);

    bus.commitCommand();
    expect((bus.drawing.entities[pid] as PolylineEntity).vertices).toHaveLength(1);
  });

  it("redo after commit returns to the committed state, not the intermediate", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const pid = newId();
    bus.beginCommand(beginPolyline(pid, d.currentLayerId));
    bus.pushSubStep(addVertex(pid, [0, 0]));
    bus.pushSubStep(addVertex(pid, [10, 0]));
    bus.pushSubStep(addVertex(pid, [10, 10]));
    bus.undoStep();
    bus.undoStep();
    bus.commitCommand();

    expect(bus.undo()).toBe(true);
    expect(bus.drawing.entities[pid]).toBeUndefined();

    expect(bus.redo()).toBe(true);
    const e = bus.drawing.entities[pid] as PolylineEntity;
    expect(e.vertices).toHaveLength(1);
    expect(e.vertices[0]?.p).toEqual([0, 0]);
  });

  it("Escape (cancel) after 2 sub-steps leaves the drawing unchanged", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const before = bus.drawing;
    const pid = newId();
    bus.beginCommand(beginPolyline(pid, d.currentLayerId));
    bus.pushSubStep(addVertex(pid, [1, 1]));
    bus.pushSubStep(addVertex(pid, [2, 2]));

    bus.cancel();
    expect(bus.drawing).toBe(before);
    expect(bus.drawing.entities[pid]).toBeUndefined();
    expect(bus.drawing.entityOrder).toHaveLength(0);
  });

  it("undoStep with no sub-steps returns false but keeps the in-flight command", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const pid = newId();
    bus.beginCommand(beginPolyline(pid, d.currentLayerId));
    expect(bus.undoStep()).toBe(false);
    // The shell entity from cmd.apply is still in place.
    expect(bus.drawing.entities[pid]).toBeDefined();
    bus.commitCommand();
  });

  it("undoStep with no command in flight returns false", () => {
    const bus = new CommandBus(newDrawing());
    expect(bus.undoStep()).toBe(false);
  });

  it("undo/redo refuse to run while a command is in flight", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const pid = newId();
    bus.beginCommand(beginPolyline(pid, d.currentLayerId));
    expect(bus.undo()).toBe(false);
    expect(bus.redo()).toBe(false);
    bus.cancel();
  });

  it("nested beginCommand throws", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const pid1 = newId();
    const pid2 = newId();
    bus.beginCommand(beginPolyline(pid1, d.currentLayerId));
    expect(() => bus.beginCommand(beginPolyline(pid2, d.currentLayerId))).toThrow();
    bus.cancel();
  });

  it("execute while in-flight throws", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const pid = newId();
    bus.beginCommand(beginPolyline(pid, d.currentLayerId));
    expect(() =>
      bus.execute(beginPolyline(newId(), d.currentLayerId)),
    ).toThrow();
    bus.cancel();
  });

  it("pushSubStep without beginCommand throws", () => {
    const bus = new CommandBus(newDrawing());
    expect(() => bus.pushSubStep(addVertex(newId(), [0, 0]))).toThrow();
  });

  it("commitCommand without beginCommand throws", () => {
    const bus = new CommandBus(newDrawing());
    expect(() => bus.commitCommand()).toThrow();
  });

  it("cancel without in-flight is a no-op", () => {
    const bus = new CommandBus(newDrawing());
    const before = bus.drawing;
    expect(() => bus.cancel()).not.toThrow();
    expect(bus.drawing).toBe(before);
  });

  it("subSteps pre-seeded on a Command are applied in execute and reversed in undo", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const pid = newId();
    const cmd = beginPolyline(pid, d.currentLayerId);
    const cmdWithSteps: Command<{ id: Id }> = {
      ...cmd,
      subSteps: [addVertex(pid, [1, 1]), addVertex(pid, [2, 2])],
    };
    bus.execute(cmdWithSteps);
    const e = bus.drawing.entities[pid] as PolylineEntity;
    expect(e.vertices).toHaveLength(2);
    bus.undo();
    expect(bus.drawing.entities[pid]).toBeUndefined();
    bus.redo();
    const e2 = bus.drawing.entities[pid] as PolylineEntity;
    expect(e2.vertices).toHaveLength(2);
  });

  it("listeners receive emitted KernelEvents and unsubscribe works", () => {
    const bus = new CommandBus(newDrawing());
    const seen: string[] = [];
    const off = bus.on((e) => seen.push(e.type));
    bus.emit({ type: "context-lost" });
    bus.emit({ type: "context-restored", durationMs: 12 });
    off();
    bus.emit({ type: "context-lost" });
    expect(seen).toEqual(["context-lost", "context-restored"]);
  });
});
