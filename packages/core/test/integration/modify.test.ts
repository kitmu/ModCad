// T089 + T091 — integration tests for every modify command factory.
//
// Each command gets at least an apply/inverse round-trip. Shapes that
// touch multiple entity kinds (move, rotate, scale, mirror) get a
// kind-specific sanity check so a regression on any single primitive
// surfaces here rather than in the UI layer.
import { describe, it, expect } from "vitest";
import { CommandBus } from "../../src/commands/CommandBus.js";
import { newDrawing } from "../../src/scene/Drawing.js";
import { drawLineCommand } from "../../src/commands/draw/drawLine.js";
import { drawCircleCenterRadiusCommand } from "../../src/commands/draw/drawCircle.js";
import { drawArcCenterEndsCommand } from "../../src/commands/draw/drawArc.js";
import { drawPolylineCommand } from "../../src/commands/draw/drawPolyline.js";
import { drawPointCommand } from "../../src/commands/draw/drawPoint.js";
import { moveCommand } from "../../src/commands/modify/move.js";
import { copyCommand } from "../../src/commands/modify/copy.js";
import { rotateCommand } from "../../src/commands/modify/rotate.js";
import {
  scaleCommand,
  InvalidScaleFactorError,
} from "../../src/commands/modify/scale.js";
import {
  mirrorCommand,
  DegenerateMirrorAxisError,
} from "../../src/commands/modify/mirror.js";
import { arrayRectCommand } from "../../src/commands/modify/arrayRect.js";
import { arrayPolarCommand } from "../../src/commands/modify/arrayPolar.js";
import {
  offsetCommand,
  UnsupportedOffsetError,
} from "../../src/commands/modify/offset.js";
import { modifyGeometryCommand } from "../../src/commands/modify/modifyGeometry.js";
import type {
  CircleEntity,
  LineEntity,
  PolylineEntity,
  PointEntity,
  ArcEntity,
} from "../../src/scene/types.js";

const EPS = 1e-9;

function nearly(a: number, b: number, tol = EPS): boolean {
  return Math.abs(a - b) <= tol;
}

describe("modify.move", () => {
  it("translates a line; undo restores; redo re-applies", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(moveCommand({ ids: [id], delta: [3, 4] }));
    const moved = bus.drawing.entities[id] as LineEntity;
    expect(moved.a).toEqual([3, 4]);
    expect(moved.b).toEqual([13, 4]);
    bus.undo();
    const restored = bus.drawing.entities[id] as LineEntity;
    expect(restored.a).toEqual([0, 0]);
    expect(restored.b).toEqual([10, 0]);
    bus.redo();
    const reapplied = bus.drawing.entities[id] as LineEntity;
    expect(reapplied.a).toEqual([3, 4]);
  });

  it("translates a circle, polyline, point in a batch", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawCircleCenterRadiusCommand({ c: [0, 0], r: 5 }));
    bus.execute(drawPolylineCommand({ vertices: [[0, 0], [1, 0], [1, 1]], closed: false }));
    bus.execute(drawPointCommand({ p: [2, 2] }));
    const ids = [...bus.drawing.entityOrder];
    bus.execute(moveCommand({ ids, delta: [1, 1] }));
    const c = bus.drawing.entities[ids[0]!] as CircleEntity;
    const pl = bus.drawing.entities[ids[1]!] as PolylineEntity;
    const pt = bus.drawing.entities[ids[2]!] as PointEntity;
    expect(c.c).toEqual([1, 1]);
    expect(pl.vertices.map((v) => v.p)).toEqual([[1, 1], [2, 1], [2, 2]]);
    expect(pt.p).toEqual([3, 3]);
    bus.undo();
    expect((bus.drawing.entities[ids[0]!] as CircleEntity).c).toEqual([0, 0]);
  });
});

describe("modify.copy", () => {
  it("duplicates a line; undo removes the duplicate", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 0] }));
    const srcId = bus.drawing.entityOrder[0]!;
    bus.execute(copyCommand({ ids: [srcId], delta: [0, 5] }));
    expect(bus.drawing.entityOrder).toHaveLength(2);
    const dupId = bus.drawing.entityOrder[1]!;
    expect(dupId).not.toBe(srcId);
    const dup = bus.drawing.entities[dupId] as LineEntity;
    expect(dup.a).toEqual([0, 5]);
    expect(dup.b).toEqual([10, 5]);
    bus.undo();
    expect(bus.drawing.entityOrder).toHaveLength(1);
    bus.redo();
    expect(bus.drawing.entityOrder).toHaveLength(2);
  });
});

describe("modify.rotate", () => {
  it("rotates a point 90° about origin", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawPointCommand({ p: [1, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(rotateCommand({ ids: [id], pivot: [0, 0], angle: Math.PI / 2 }));
    const p = bus.drawing.entities[id] as PointEntity;
    expect(nearly(p.p[0], 0)).toBe(true);
    expect(nearly(p.p[1], 1)).toBe(true);
    bus.undo();
    const r = bus.drawing.entities[id] as PointEntity;
    expect(nearly(r.p[0], 1)).toBe(true);
    expect(nearly(r.p[1], 0)).toBe(true);
  });

  it("rotates an arc and updates startAngle/endAngle", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(
      drawArcCenterEndsCommand({ c: [0, 0], start: [1, 0], end: [0, 1] }),
    );
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(rotateCommand({ ids: [id], pivot: [0, 0], angle: Math.PI }));
    const arc = bus.drawing.entities[id] as ArcEntity;
    expect(nearly(arc.startAngle, Math.PI)).toBe(true);
    expect(nearly(arc.endAngle, Math.PI + Math.PI / 2)).toBe(true);
  });
});

describe("modify.scale", () => {
  it("uniformly scales a circle about origin and undoes", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawCircleCenterRadiusCommand({ c: [2, 0], r: 3 }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(scaleCommand({ ids: [id], pivot: [0, 0], factor: 2 }));
    const c = bus.drawing.entities[id] as CircleEntity;
    expect(c.c).toEqual([4, 0]);
    expect(c.r).toBe(6);
    bus.undo();
    const r = bus.drawing.entities[id] as CircleEntity;
    expect(r.c).toEqual([2, 0]);
    expect(r.r).toBe(3);
  });

  it("rejects factor zero / NaN", () => {
    expect(() => scaleCommand({ ids: [], pivot: [0, 0], factor: 0 })).toThrow(
      InvalidScaleFactorError,
    );
    expect(() =>
      scaleCommand({ ids: [], pivot: [0, 0], factor: Number.NaN }),
    ).toThrow(InvalidScaleFactorError);
  });
});

describe("modify.mirror", () => {
  it("mirrors a line across the y-axis", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [1, 0], b: [2, 1] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(mirrorCommand({ ids: [id], axis: { a: [0, 0], b: [0, 1] } }));
    const l = bus.drawing.entities[id] as LineEntity;
    expect(nearly(l.a[0], -1)).toBe(true);
    expect(nearly(l.a[1], 0)).toBe(true);
    expect(nearly(l.b[0], -2)).toBe(true);
    expect(nearly(l.b[1], 1)).toBe(true);
    bus.undo();
    const r = bus.drawing.entities[id] as LineEntity;
    expect(r.a).toEqual([1, 0]);
    expect(r.b).toEqual([2, 1]);
  });

  it("with keepOriginal=true preserves the source", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [1, 0], b: [2, 1] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(
      mirrorCommand({
        ids: [id],
        axis: { a: [0, 0], b: [0, 1] },
        keepOriginal: true,
      }),
    );
    expect(bus.drawing.entityOrder).toHaveLength(2);
    const orig = bus.drawing.entities[id] as LineEntity;
    expect(orig.a).toEqual([1, 0]);
  });

  it("rejects zero-length axis", () => {
    expect(() =>
      mirrorCommand({ ids: [], axis: { a: [0, 0], b: [0, 0] } }),
    ).toThrow(DegenerateMirrorAxisError);
  });
});

describe("modify.arrayRect", () => {
  it("3x2 array of a line creates 5 new copies (original stays)", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [1, 0] }));
    const srcId = bus.drawing.entityOrder[0]!;
    bus.execute(
      arrayRectCommand({
        ids: [srcId],
        rows: 2,
        columns: 3,
        rowSpacing: 10,
        columnSpacing: 10,
      }),
    );
    // 2 rows * 3 cols = 6 slots; -1 for the original = 5 copies.
    expect(bus.drawing.entityOrder.length).toBe(6);
    bus.undo();
    expect(bus.drawing.entityOrder.length).toBe(1);
  });
});

describe("modify.arrayPolar", () => {
  it("8-count full-circle polar array around origin", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [1, 0], b: [2, 0] }));
    const srcId = bus.drawing.entityOrder[0]!;
    bus.execute(
      arrayPolarCommand({
        ids: [srcId],
        center: [0, 0],
        count: 8,
        totalAngle: Math.PI * 2,
        rotateItems: true,
      }),
    );
    expect(bus.drawing.entityOrder.length).toBe(8);
    // The 90° slot (slot 2 of 8 at 2π) should be at angle π/2 — its
    // line should approximately run from (0,1) to (0,2).
    const slot2Id = bus.drawing.entityOrder[2]!;
    const slot2 = bus.drawing.entities[slot2Id] as LineEntity;
    expect(nearly(slot2.a[0], 0, 1e-9)).toBe(true);
    expect(nearly(slot2.a[1], 1, 1e-9)).toBe(true);
    bus.undo();
    expect(bus.drawing.entityOrder.length).toBe(1);
  });
});

describe("modify.offset", () => {
  it("offsets a horizontal line up by d (positive d = left of direction)", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(offsetCommand({ id, distance: 1 }));
    expect(bus.drawing.entityOrder.length).toBe(2);
    const off = bus.drawing.entities[bus.drawing.entityOrder[1]!] as LineEntity;
    // Direction (1,0) -> left normal (0,1) -> offset by +1 -> y=1.
    expect(off.a).toEqual([0, 1]);
    expect(off.b).toEqual([10, 1]);
  });

  it("offsets a circle outward", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawCircleCenterRadiusCommand({ c: [0, 0], r: 5 }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(offsetCommand({ id, distance: 2 }));
    const off = bus.drawing.entities[bus.drawing.entityOrder[1]!] as CircleEntity;
    expect(off.r).toBe(7);
  });

  it("rejects ellipse / text / point / dimension", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawPointCommand({ p: [0, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    expect(() =>
      bus.execute(offsetCommand({ id, distance: 1 })),
    ).toThrow(UnsupportedOffsetError);
  });
});

describe("modify.geometry (grip commit)", () => {
  it("moves a line endpoint and undoes", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(
      modifyGeometryCommand({ entityId: id, member: "b", newValue: [5, 5] }),
    );
    const l = bus.drawing.entities[id] as LineEntity;
    expect(l.b).toEqual([5, 5]);
    bus.undo();
    expect((bus.drawing.entities[id] as LineEntity).b).toEqual([10, 0]);
  });

  it("moves a polyline vertex by index", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(
      drawPolylineCommand({ vertices: [[0, 0], [1, 0], [1, 1]], closed: false }),
    );
    const id = bus.drawing.entityOrder[0]!;
    bus.execute(
      modifyGeometryCommand({
        entityId: id,
        member: { vertexIndex: 1 },
        newValue: [2, 2],
      }),
    );
    const pl = bus.drawing.entities[id] as PolylineEntity;
    expect(pl.vertices[1]!.p).toEqual([2, 2]);
  });
});
