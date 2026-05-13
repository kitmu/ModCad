// modify.arrayRect — FR-005. Rectangular array of selected entities.
//
// v1: levels=1 (planar). Creates rows × columns copies of every
// entity in `ids`. The (0,0) slot is the original — we skip
// duplicating it. New ids are allocated up-front so redo is stable.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface ArrayRectParams {
  ids: ReadonlyArray<Id>;
  rows: number;
  columns: number;
  rowSpacing: number;
  columnSpacing: number;
}

function translatePoint(p: Vec2, dx: number, dy: number): Vec2 {
  return [p[0] + dx, p[1] + dy];
}

function cloneTranslated(e: Entity, newIdValue: Id, dx: number, dy: number): Entity {
  switch (e.kind) {
    case "line":
      return {
        ...e,
        id: newIdValue,
        a: translatePoint(e.a, dx, dy),
        b: translatePoint(e.b, dx, dy),
      };
    case "polyline":
      return {
        ...e,
        id: newIdValue,
        vertices: e.vertices.map((v) => ({
          p: translatePoint(v.p, dx, dy),
          bulge: v.bulge,
        })),
      };
    case "circle":
      return { ...e, id: newIdValue, c: translatePoint(e.c, dx, dy) };
    case "arc":
      return { ...e, id: newIdValue, c: translatePoint(e.c, dx, dy) };
    case "ellipse":
      return { ...e, id: newIdValue, c: translatePoint(e.c, dx, dy) };
    case "point":
      return { ...e, id: newIdValue, p: translatePoint(e.p, dx, dy) };
    case "text":
      return { ...e, id: newIdValue, anchor: translatePoint(e.anchor, dx, dy) };
    case "dimension":
      return { ...e, id: newIdValue };
    default: {
      const _exhaustive: never = e;
      throw new Error(
        `modify.arrayRect: unsupported kind ${String((_exhaustive as Entity).kind)}`,
      );
    }
  }
}

export function arrayRectCommand(
  params: ArrayRectParams,
): Command<ArrayRectParams> {
  const sourceIds = [...params.ids];
  const { rows, columns, rowSpacing, columnSpacing } = params;
  // Pre-allocate ids for every (row, column, sourceIndex) slot except
  // the (0,0) skip-slot.
  const cells: { row: number; col: number; srcIdx: number; id: Id }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (r === 0 && c === 0) continue;
      for (let i = 0; i < sourceIds.length; i++) {
        cells.push({ row: r, col: c, srcIdx: i, id: newId() });
      }
    }
  }
  return {
    name: "modify.arrayRect",
    params,
    apply(draft: Draft<Drawing>) {
      for (const cell of cells) {
        const src = draft.entities[sourceIds[cell.srcIdx]!];
        if (!src) continue;
        const dx = cell.col * columnSpacing;
        const dy = cell.row * rowSpacing;
        const dst = cloneTranslated(src as Entity, cell.id, dx, dy);
        draft.entities[cell.id] = castDraft(dst);
        draft.entityOrder.push(cell.id);
      }
    },
    inverse(draft: Draft<Drawing>) {
      for (const cell of cells) {
        delete draft.entities[cell.id];
        const idx = draft.entityOrder.indexOf(cell.id);
        if (idx >= 0) draft.entityOrder.splice(idx, 1);
      }
    },
  };
}
