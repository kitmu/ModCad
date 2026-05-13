// T021 — property test: predicate stability after origin rebase.
// orient2d(a, b, c) sign must be preserved after rebasing by an
// arbitrary newOrigin within Tier B (≤1e9 units from origin).
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { castDraft } from "immer";
import { CommandBus } from "../../src/commands/CommandBus.js";
import { newDrawing } from "../../src/scene/Drawing.js";
import { originRebaseCommand } from "../../src/scene/originRebase.js";
import { newId, type Id } from "../../src/ids.js";
import type { LineEntity } from "../../src/scene/types.js";

function orient2dRaw(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function signOf(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

function makeLine(a: [number, number], b: [number, number], layerId: Id): LineEntity {
  return {
    id: newId(),
    kind: "line",
    layerId,
    color: "byLayer",
    lineweight: "byLayer",
    a,
    b,
  };
}

describe("originRebaseCommand — predicate stability", () => {
  it("shifts every entity by -(newOrigin - currentOrigin) and updates originOffset", () => {
    const d = newDrawing();
    const bus = new CommandBus(d);
    const line = makeLine([100, 200], [300, 400], d.currentLayerId);
    bus.execute({
      name: "test.add",
      params: {},
      apply(draft) {
        draft.entities[line.id] = castDraft(line);
        draft.entityOrder.push(line.id);
      },
      inverse(draft) {
        delete draft.entities[line.id];
        const i = draft.entityOrder.indexOf(line.id);
        if (i >= 0) draft.entityOrder.splice(i, 1);
      },
    });

    bus.execute(originRebaseCommand([50, 75]));
    const moved = bus.drawing.entities[line.id] as LineEntity;
    expect(moved.a).toEqual([50, 125]);
    expect(moved.b).toEqual([250, 325]);
    expect(bus.drawing.originOffset).toEqual([50, 75]);

    bus.undo();
    const back = bus.drawing.entities[line.id] as LineEntity;
    expect(back.a).toEqual([100, 200]);
    expect(back.b).toEqual([300, 400]);
    expect(bus.drawing.originOffset).toEqual([0, 0]);
  });

  it("orient2d sign of three points is preserved after a Tier-B-edge rebase (10^9)", () => {
    fc.assert(
      fc.property(
        // pick three points in a moderate range to keep the triangle
        // non-degenerate, then translate them up into Tier B by a big
        // offset and rebase back to test the round-trip.
        fc.tuple(
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          fc.double({ min: -1e9, max: 1e9, noNaN: true }),
          fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        ),
        ([ax, ay, bx, by, cx, cy, ox, oy]) => {
          // require a non-degenerate triangle (small slivers may flip
          // sign under FP, which is the whole point of the rebase —
          // only assert stability for triangles whose area is large
          // enough that the naive FP determinant is unambiguous).
          const local = orient2dRaw(ax, ay, bx, by, cx, cy);
          if (Math.abs(local) < 1) return true;
          const localSign = signOf(local);

          const d = newDrawing();
          const bus = new CommandBus(d);
          const layerId = d.currentLayerId;
          // place two entities anchored at the (ox,oy)-offset Tier-B
          // positions so that after rebase to (ox,oy) they sit at the
          // local-frame positions a,b,c. Then rebase back to origin
          // and re-evaluate the predicate.
          const lineAB = makeLine([ax + ox, ay + oy], [bx + ox, by + oy], layerId);
          const lineC = makeLine([cx + ox, cy + oy], [cx + ox, cy + oy], layerId);
          bus.execute({
            name: "test.seed",
            params: {},
            apply(draft) {
              draft.entities[lineAB.id] = castDraft(lineAB);
              draft.entities[lineC.id] = castDraft(lineC);
              draft.entityOrder.push(lineAB.id, lineC.id);
            },
            inverse(draft) {
              delete draft.entities[lineAB.id];
              delete draft.entities[lineC.id];
              draft.entityOrder.length = 0;
            },
          });

          bus.execute(originRebaseCommand([ox, oy]));
          const ab = bus.drawing.entities[lineAB.id] as LineEntity;
          const c = bus.drawing.entities[lineC.id] as LineEntity;
          const rebasedSign = signOf(
            orient2dRaw(
              ab.a[0], ab.a[1],
              ab.b[0], ab.b[1],
              c.a[0], c.a[1],
            ),
          );
          expect(rebasedSign).toBe(localSign);
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("inverse of inverse equals apply (round-trip)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        fc.double({ min: -1e9, max: 1e9, noNaN: true }),
        (ox, oy) => {
          const d = newDrawing();
          const bus = new CommandBus(d);
          const line = makeLine([10, 20], [30, 40], d.currentLayerId);
          bus.execute({
            name: "seed",
            params: {},
            apply(draft) {
              draft.entities[line.id] = castDraft(line);
              draft.entityOrder.push(line.id);
            },
            inverse(draft) {
              delete draft.entities[line.id];
              draft.entityOrder.length = 0;
            },
          });
          const before = bus.drawing;
          bus.execute(originRebaseCommand([ox, oy]));
          bus.undo();
          const e = bus.drawing.entities[line.id] as LineEntity;
          const e0 = before.entities[line.id] as LineEntity;
          expect(e.a).toEqual(e0.a);
          expect(e.b).toEqual(e0.b);
          expect(bus.drawing.originOffset).toEqual(before.originOffset);
          return true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it("shifts polyline, circle, arc, ellipse, point, text, and dimension anchors", () => {
    const d = newDrawing();
    const layerId = d.currentLayerId;
    const bus = new CommandBus(d);
    const polyId = newId();
    const circId = newId();
    const arcId = newId();
    const ellId = newId();
    const pointId = newId();
    const textId = newId();
    const dimLinearId = newId();
    const dimAngularId = newId();
    const dimRadialId = newId();
    bus.execute({
      name: "seed",
      params: {},
      apply(draft) {
        draft.entities[polyId] = castDraft({
          id: polyId, kind: "polyline", layerId,
          color: "byLayer", lineweight: "byLayer",
          vertices: [{ p: [1, 2] as const, bulge: 0 }, { p: [3, 4] as const, bulge: 0 }],
          closed: false,
        });
        draft.entities[circId] = castDraft({
          id: circId, kind: "circle", layerId,
          color: "byLayer", lineweight: "byLayer",
          c: [10, 10] as const, r: 5,
        });
        draft.entities[arcId] = castDraft({
          id: arcId, kind: "arc", layerId,
          color: "byLayer", lineweight: "byLayer",
          c: [20, 20] as const, r: 5, startAngle: 0, endAngle: 1,
        });
        draft.entities[ellId] = castDraft({
          id: ellId, kind: "ellipse", layerId,
          color: "byLayer", lineweight: "byLayer",
          c: [30, 30] as const, major: [1, 0] as const, ratio: 0.5, startParam: 0, endParam: 1,
        });
        draft.entities[pointId] = castDraft({
          id: pointId, kind: "point", layerId,
          color: "byLayer", lineweight: "byLayer",
          p: [40, 40] as const,
        });
        draft.entities[textId] = castDraft({
          id: textId, kind: "text", layerId,
          color: "byLayer", lineweight: "byLayer",
          anchor: [50, 50] as const, height: 2, rotation: 0, align: "bl",
          value: "x", styleId: newId(),
        });
        draft.entities[dimLinearId] = castDraft({
          id: dimLinearId, kind: "dimension", layerId,
          color: "byLayer", lineweight: "byLayer",
          variant: "linear",
          refs: { variant: "linear", a: [60, 60] as const, b: [70, 60] as const, axis: "x" },
          offset: 5, styleId: newId(),
        });
        draft.entities[dimAngularId] = castDraft({
          id: dimAngularId, kind: "dimension", layerId,
          color: "byLayer", lineweight: "byLayer",
          variant: "angular",
          refs: { variant: "angular", v: [80, 80] as const, a: [90, 80] as const, b: [80, 90] as const },
          offset: 5, styleId: newId(),
        });
        draft.entities[dimRadialId] = castDraft({
          id: dimRadialId, kind: "dimension", layerId,
          color: "byLayer", lineweight: "byLayer",
          variant: "radial",
          refs: { variant: "radial", entity: circId },
          offset: 5, styleId: newId(),
        });
        draft.entityOrder.push(
          polyId, circId, arcId, ellId, pointId, textId,
          dimLinearId, dimAngularId, dimRadialId,
        );
      },
      inverse(draft) {
        for (const id of [polyId, circId, arcId, ellId, pointId, textId, dimLinearId, dimAngularId, dimRadialId]) {
          delete draft.entities[id];
        }
        draft.entityOrder.length = 0;
      },
    });

    bus.execute(originRebaseCommand([1, 1]));
    const poly = bus.drawing.entities[polyId];
    expect(poly?.kind).toBe("polyline");
    if (poly?.kind === "polyline") {
      expect(poly.vertices[0]?.p).toEqual([0, 1]);
      expect(poly.vertices[1]?.p).toEqual([2, 3]);
    }
    const circ = bus.drawing.entities[circId];
    if (circ?.kind === "circle") expect(circ.c).toEqual([9, 9]);
    const arc = bus.drawing.entities[arcId];
    if (arc?.kind === "arc") expect(arc.c).toEqual([19, 19]);
    const ell = bus.drawing.entities[ellId];
    if (ell?.kind === "ellipse") expect(ell.c).toEqual([29, 29]);
    const pt = bus.drawing.entities[pointId];
    if (pt?.kind === "point") expect(pt.p).toEqual([39, 39]);
    const txt = bus.drawing.entities[textId];
    if (txt?.kind === "text") expect(txt.anchor).toEqual([49, 49]);

    const dimLin = bus.drawing.entities[dimLinearId];
    if (dimLin?.kind === "dimension" && dimLin.refs.variant === "linear") {
      expect(dimLin.refs.a).toEqual([59, 59]);
      expect(dimLin.refs.b).toEqual([69, 59]);
    }
    const dimAng = bus.drawing.entities[dimAngularId];
    if (dimAng?.kind === "dimension" && dimAng.refs.variant === "angular") {
      expect(dimAng.refs.v).toEqual([79, 79]);
      expect(dimAng.refs.a).toEqual([89, 79]);
      expect(dimAng.refs.b).toEqual([79, 89]);
    }
    const dimRad = bus.drawing.entities[dimRadialId];
    if (dimRad?.kind === "dimension" && dimRad.refs.variant === "radial") {
      // radial refs only carry an entity id, not coords — unchanged.
      expect(dimRad.refs.entity).toBe(circId);
    }
  });
});
