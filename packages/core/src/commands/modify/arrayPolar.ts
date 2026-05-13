// modify.arrayPolar — FR-005. Polar array of selected entities around
// `center`. Produces `count - 1` new copies at evenly-spaced angles
// (slot 0 is the original and is left alone). When `rotateItems` is
// true each copy is rotated by its slot angle in addition to being
// placed at the polar position.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface ArrayPolarParams {
  ids: ReadonlyArray<Id>;
  center: Vec2;
  count: number;
  totalAngle: number; // radians
  rotateItems: boolean;
}

function rotatePoint(p: Vec2, pivot: Vec2, cos: number, sin: number): Vec2 {
  const dx = p[0] - pivot[0];
  const dy = p[1] - pivot[1];
  return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos];
}

function rotateVec(v: Vec2, cos: number, sin: number): Vec2 {
  return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos];
}

function placeAt(
  e: Entity,
  newIdValue: Id,
  center: Vec2,
  angle: number,
  rotateItems: boolean,
): Entity {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  switch (e.kind) {
    case "line":
      return {
        ...e,
        id: newIdValue,
        a: rotatePoint(e.a, center, cos, sin),
        b: rotatePoint(e.b, center, cos, sin),
      };
    case "polyline":
      return {
        ...e,
        id: newIdValue,
        vertices: e.vertices.map((v) => ({
          p: rotatePoint(v.p, center, cos, sin),
          bulge: v.bulge,
        })),
      };
    case "circle":
      return { ...e, id: newIdValue, c: rotatePoint(e.c, center, cos, sin) };
    case "arc":
      return {
        ...e,
        id: newIdValue,
        c: rotatePoint(e.c, center, cos, sin),
        startAngle: rotateItems ? e.startAngle + angle : e.startAngle,
        endAngle: rotateItems ? e.endAngle + angle : e.endAngle,
      };
    case "ellipse":
      return {
        ...e,
        id: newIdValue,
        c: rotatePoint(e.c, center, cos, sin),
        major: rotateItems ? rotateVec(e.major, cos, sin) : e.major,
      };
    case "point":
      return { ...e, id: newIdValue, p: rotatePoint(e.p, center, cos, sin) };
    case "text":
      return {
        ...e,
        id: newIdValue,
        anchor: rotatePoint(e.anchor, center, cos, sin),
        rotation: rotateItems ? e.rotation + angle : e.rotation,
      };
    case "dimension":
      return { ...e, id: newIdValue };
    default: {
      const _exhaustive: never = e;
      throw new Error(
        `modify.arrayPolar: unsupported kind ${String((_exhaustive as Entity).kind)}`,
      );
    }
  }
}

export function arrayPolarCommand(
  params: ArrayPolarParams,
): Command<ArrayPolarParams> {
  if (params.count < 1) {
    throw new Error(`modify.arrayPolar: count must be >= 1 (got ${params.count})`);
  }
  const sourceIds = [...params.ids];
  const center: Vec2 = [params.center[0], params.center[1]];
  const count = params.count;
  // Step angle: divide the total span by count. A full-circle array
  // (totalAngle = 2π) gets `count` equally-spaced slots including the
  // original; a partial span (e.g. semicircle) places `count` slots
  // across [0, totalAngle].
  const isFullCircle = Math.abs(Math.abs(params.totalAngle) - Math.PI * 2) < 1e-9;
  const stepAngle = isFullCircle
    ? params.totalAngle / count
    : params.totalAngle / Math.max(count - 1, 1);

  const cells: { slot: number; srcIdx: number; id: Id }[] = [];
  for (let slot = 1; slot < count; slot++) {
    for (let i = 0; i < sourceIds.length; i++) {
      cells.push({ slot, srcIdx: i, id: newId() });
    }
  }
  return {
    name: "modify.arrayPolar",
    params,
    apply(draft: Draft<Drawing>) {
      for (const cell of cells) {
        const src = draft.entities[sourceIds[cell.srcIdx]!];
        if (!src) continue;
        const angle = stepAngle * cell.slot;
        const dst = placeAt(src as Entity, cell.id, center, angle, params.rotateItems);
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
