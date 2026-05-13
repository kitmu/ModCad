// modify.copy — FR-005. Duplicate every selected entity, translated
// by `delta`. New entities receive fresh ids (data-model.md: ids never
// recycle across undo); apply re-uses the captured ids on redo so the
// downstream selection/grip caches stay stable.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface CopyParams {
  ids: ReadonlyArray<Id>;
  delta: Vec2;
}

function translatePoint(p: Vec2, dx: number, dy: number): Vec2 {
  return [p[0] + dx, p[1] + dy];
}

function cloneAndTranslate(e: Entity, newIdValue: Id, dx: number, dy: number): Entity {
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
        `modify.copy: unsupported kind ${String((_exhaustive as Entity).kind)}`,
      );
    }
  }
}

export function copyCommand(params: CopyParams): Command<CopyParams> {
  const sourceIds = [...params.ids];
  // Pre-allocate target ids so apply/inverse and redo all hit the same set.
  const targetIds: Id[] = sourceIds.map(() => newId());
  const dx = params.delta[0];
  const dy = params.delta[1];
  return {
    name: "modify.copy",
    params,
    apply(draft: Draft<Drawing>) {
      for (let i = 0; i < sourceIds.length; i++) {
        const src = draft.entities[sourceIds[i]!];
        if (!src) continue;
        const dst = cloneAndTranslate(src as Entity, targetIds[i]!, dx, dy);
        draft.entities[targetIds[i]!] = castDraft(dst);
        draft.entityOrder.push(targetIds[i]!);
      }
    },
    inverse(draft: Draft<Drawing>) {
      for (const id of targetIds) {
        delete draft.entities[id];
        const idx = draft.entityOrder.indexOf(id);
        if (idx >= 0) draft.entityOrder.splice(idx, 1);
      }
    },
  };
}
