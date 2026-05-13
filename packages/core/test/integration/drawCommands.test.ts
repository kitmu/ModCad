// T050 — integration tests for every draw command factory.
import { describe, it, expect } from "vitest";
import { CommandBus } from "../../src/commands/CommandBus.js";
import { newDrawing } from "../../src/scene/Drawing.js";
import { drawLineCommand } from "../../src/commands/draw/drawLine.js";
import { drawRectangleCommand } from "../../src/commands/draw/drawRectangle.js";
import {
  drawCircleCenterRadiusCommand,
  drawCircle2PointCommand,
  drawCircle3PointCommand,
  CollinearError,
} from "../../src/commands/draw/drawCircle.js";
import {
  drawArcCenterEndsCommand,
  drawArc3PointCommand,
} from "../../src/commands/draw/drawArc.js";
import {
  drawPolylineCommand,
  startPolyline,
} from "../../src/commands/draw/drawPolyline.js";
import { drawEllipseCommand } from "../../src/commands/draw/drawEllipse.js";
import { drawPointCommand } from "../../src/commands/draw/drawPoint.js";
import type {
  ArcEntity,
  CircleEntity,
  EllipseEntity,
  LineEntity,
  PointEntity,
  PolylineEntity,
} from "../../src/scene/types.js";

const EPS = 1e-9;

describe("draw.line", () => {
  it("execute adds a line on the current layer; undo/redo round-trip", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    bus.execute(drawLineCommand({ a: [0, 0], b: [10, 5] }));
    expect(bus.drawing.entityOrder).toHaveLength(1);
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as LineEntity;
    expect(e.kind).toBe("line");
    expect(e.layerId).toBe(d.currentLayerId);
    expect(e.a).toEqual([0, 0]);
    expect(e.b).toEqual([10, 5]);

    bus.undo();
    expect(bus.drawing.entityOrder).toHaveLength(0);
    expect(bus.drawing.entities[id]).toBeUndefined();

    bus.redo();
    expect(bus.drawing.entityOrder).toHaveLength(1);
    expect(bus.drawing.entities[id]).toBeDefined();
  });
});

describe("draw.rectangle", () => {
  it("creates a closed polyline with 4 zero-bulge vertices", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    bus.execute(drawRectangleCommand({ a: [0, 0], b: [10, 5] }));
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as PolylineEntity;
    expect(e.kind).toBe("polyline");
    expect(e.closed).toBe(true);
    expect(e.vertices).toHaveLength(4);
    expect(e.vertices.map((v) => v.p)).toEqual([
      [0, 0],
      [10, 0],
      [10, 5],
      [0, 5],
    ]);
    expect(e.vertices.every((v) => v.bulge === 0)).toBe(true);
  });
});

describe("draw.circle (3 variants)", () => {
  it("center+radius is direct", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawCircleCenterRadiusCommand({ c: [1, 2], r: 5 }));
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as CircleEntity;
    expect(e.c).toEqual([1, 2]);
    expect(e.r).toBe(5);
  });

  it("2-point treats inputs as diameter endpoints", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawCircle2PointCommand({ a: [0, 0], b: [10, 0] }));
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as CircleEntity;
    expect(e.c).toEqual([5, 0]);
    expect(e.r).toBe(5);
  });

  it("3-point builds circumcircle (unit circle through axis points)", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(
      drawCircle3PointCommand({ a: [1, 0], b: [0, 1], c: [-1, 0] }),
    );
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as CircleEntity;
    expect(Math.abs(e.c[0] - 0)).toBeLessThan(EPS);
    expect(Math.abs(e.c[1] - 0)).toBeLessThan(EPS);
    expect(Math.abs(e.r - 1)).toBeLessThan(EPS);
  });

  it("3-point throws CollinearError on collinear input", () => {
    expect(() =>
      drawCircle3PointCommand({ a: [0, 0], b: [1, 0], c: [2, 0] }),
    ).toThrow(CollinearError);
  });
});

describe("draw.arc (2 variants)", () => {
  it("center+ends builds correct center/radius/angles", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(
      drawArcCenterEndsCommand({
        c: [0, 0],
        start: [1, 0],
        end: [0, 1],
        ccw: true,
      }),
    );
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as ArcEntity;
    expect(e.c).toEqual([0, 0]);
    expect(Math.abs(e.r - 1)).toBeLessThan(EPS);
    expect(Math.abs(e.startAngle - 0)).toBeLessThan(EPS);
    expect(Math.abs(e.endAngle - Math.PI / 2)).toBeLessThan(EPS);
  });

  it("3-point arc through (1,0),(0,1),(-1,0) is the upper unit half", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(
      drawArc3PointCommand({ a: [1, 0], b: [0, 1], c: [-1, 0] }),
    );
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as ArcEntity;
    expect(Math.abs(e.c[0])).toBeLessThan(EPS);
    expect(Math.abs(e.c[1])).toBeLessThan(EPS);
    expect(Math.abs(e.r - 1)).toBeLessThan(EPS);
    expect(Math.abs(e.startAngle - 0)).toBeLessThan(EPS);
    expect(Math.abs(e.endAngle - Math.PI)).toBeLessThan(EPS);
  });
});

describe("draw.polyline one-shot", () => {
  it("commits an open polyline with the supplied vertices", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(
      drawPolylineCommand({
        vertices: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        closed: false,
      }),
    );
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as PolylineEntity;
    expect(e.vertices).toHaveLength(3);
    expect(e.closed).toBe(false);
    bus.undo();
    expect(bus.drawing.entityOrder).toHaveLength(0);
  });
});

describe("draw.polyline interactive draft (FR-006a)", () => {
  it("addVertex 3 times, removeLastVertex once, commit closed=true → 2 vertices, closed", () => {
    const bus = new CommandBus(newDrawing());
    const draft = startPolyline(bus);
    draft.addVertex([0, 0]);
    draft.addVertex([1, 0]);
    draft.addVertex([1, 1]);
    draft.removeLastVertex();
    draft.commit(true);

    const e = bus.drawing.entities[draft.id] as PolylineEntity;
    expect(e.vertices).toHaveLength(2);
    expect(e.vertices.map((v) => v.p)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(e.closed).toBe(true);
  });

  it("sub-step undo works mid-draft", () => {
    const bus = new CommandBus(newDrawing());
    const draft = startPolyline(bus);
    draft.addVertex([0, 0]);
    draft.addVertex([1, 0]);
    draft.addVertex([1, 1]);

    let e = bus.drawing.entities[draft.id] as PolylineEntity;
    expect(e.vertices).toHaveLength(3);

    expect(bus.undoStep()).toBe(true);
    e = bus.drawing.entities[draft.id] as PolylineEntity;
    expect(e.vertices).toHaveLength(2);

    expect(bus.undoStep()).toBe(true);
    e = bus.drawing.entities[draft.id] as PolylineEntity;
    expect(e.vertices).toHaveLength(1);

    draft.commit(false);
    const final = bus.drawing.entities[draft.id] as PolylineEntity;
    expect(final.vertices).toHaveLength(1);
    expect(final.closed).toBe(false);
  });

  it("global undo after commit removes the whole polyline in one step", () => {
    const bus = new CommandBus(newDrawing());
    const draft = startPolyline(bus);
    draft.addVertex([0, 0]);
    draft.addVertex([1, 1]);
    draft.commit(false);

    expect(bus.drawing.entityOrder).toHaveLength(1);
    expect(bus.undo()).toBe(true);
    expect(bus.drawing.entityOrder).toHaveLength(0);
    expect(bus.redo()).toBe(true);
    const e = bus.drawing.entities[draft.id] as PolylineEntity;
    expect(e.vertices).toHaveLength(2);
  });
});

describe("draw.ellipse + draw.point round-trip", () => {
  it("full ellipse defaults to 0..2π and round-trips via undo/redo", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(
      drawEllipseCommand({ c: [0, 0], major: [2, 0], ratio: 0.5 }),
    );
    const id = bus.drawing.entityOrder[0]!;
    let e = bus.drawing.entities[id] as EllipseEntity;
    expect(e.c).toEqual([0, 0]);
    expect(e.major).toEqual([2, 0]);
    expect(e.ratio).toBe(0.5);
    expect(e.startParam).toBe(0);
    expect(e.endParam).toBeCloseTo(2 * Math.PI, 12);

    bus.undo();
    expect(bus.drawing.entityOrder).toHaveLength(0);
    bus.redo();
    e = bus.drawing.entities[id] as EllipseEntity;
    expect(e.endParam).toBeCloseTo(2 * Math.PI, 12);
  });

  it("draw.point with styleOverride round-trips", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(
      drawPointCommand({
        p: [3, 4],
        styleOverride: { mode: "x", size: 4, sizeInPixels: true },
      }),
    );
    const id = bus.drawing.entityOrder[0]!;
    const e = bus.drawing.entities[id] as PointEntity;
    expect(e.p).toEqual([3, 4]);
    expect(e.styleOverride?.mode).toBe("x");
    bus.undo();
    expect(bus.drawing.entityOrder).toHaveLength(0);
    bus.redo();
    expect((bus.drawing.entities[id] as PointEntity).styleOverride?.mode).toBe("x");
  });
});

describe("entityOrder gets a new id at the end after every commit", () => {
  it("appends in execute order", () => {
    const bus = new CommandBus(newDrawing());
    bus.execute(drawLineCommand({ a: [0, 0], b: [1, 0] }));
    bus.execute(drawCircleCenterRadiusCommand({ c: [0, 0], r: 1 }));
    bus.execute(drawPointCommand({ p: [0, 0] }));
    expect(bus.drawing.entityOrder).toHaveLength(3);
    const kinds = bus.drawing.entityOrder.map((id) => bus.drawing.entities[id]!.kind);
    expect(kinds).toEqual(["line", "circle", "point"]);
  });
});
