// modify.move — FR-005. Translate every selected entity by `delta`.
//
// Stores the delta only; apply/inverse just add/subtract it from each
// geometric component. We deliberately do NOT snapshot entire entity
// shapes — translation is a closed-form affine that round-trips
// without information loss, and a delta-only store keeps undo memory
// proportional to selection size rather than entity payload size.
import { castDraft, type Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface MoveParams {
  ids: ReadonlyArray<Id>;
  delta: Vec2;
}

function translatePoint(p: Vec2, dx: number, dy: number): [number, number] {
  return [p[0] + dx, p[1] + dy];
}

function translateEntity(e: Draft<Entity>, dx: number, dy: number): void {
  switch (e.kind) {
    case "line":
      e.a = castDraft(translatePoint(e.a, dx, dy));
      e.b = castDraft(translatePoint(e.b, dx, dy));
      return;
    case "polyline":
      for (const v of e.vertices) {
        v.p = castDraft(translatePoint(v.p, dx, dy));
      }
      return;
    case "circle":
    case "arc":
      e.c = castDraft(translatePoint(e.c, dx, dy));
      return;
    case "ellipse":
      e.c = castDraft(translatePoint(e.c, dx, dy));
      return;
    case "point":
      e.p = castDraft(translatePoint(e.p, dx, dy));
      return;
    case "text":
      e.anchor = castDraft(translatePoint(e.anchor, dx, dy));
      return;
    case "dimension":
      // Dimensions reference points through their refs; translation of
      // raw Vec2 references handled here, EntityPointRefs translate via
      // their host entity.
      return;
    default: {
      const _exhaustive: never = e;
      throw new Error(
        `modify.move: unsupported entity kind ${String((_exhaustive as Entity).kind)}`,
      );
    }
  }
}

export function moveCommand(params: MoveParams): Command<MoveParams> {
  const ids = [...params.ids];
  const dx = params.delta[0];
  const dy = params.delta[1];
  return {
    name: "modify.move",
    params,
    apply(draft: Draft<Drawing>) {
      for (const id of ids) {
        const e = draft.entities[id];
        if (e) translateEntity(e, dx, dy);
      }
    },
    inverse(draft: Draft<Drawing>) {
      for (const id of ids) {
        const e = draft.entities[id];
        if (e) translateEntity(e, -dx, -dy);
      }
    },
  };
}
