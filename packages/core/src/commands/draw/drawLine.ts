// draw.line — FR-001 primitive.
//
// Allocates the entity id at command-construction time so apply/inverse
// (and any redo) reference the same id. Per data-model.md, ids are not
// reused across an undo→re-add cycle; we honor that by treating each
// `drawLineCommand(...)` call as one identity.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, LineEntity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface DrawLineParams {
  a: Vec2;
  b: Vec2;
  layerId?: Id;
}

export function drawLineCommand(params: DrawLineParams): Command<DrawLineParams> {
  const id = newId();
  return {
    name: "draw.line",
    params,
    apply(draft: Draft<Drawing>) {
      const entity: LineEntity = {
        id,
        kind: "line",
        layerId: params.layerId ?? draft.currentLayerId,
        color: "byLayer",
        lineweight: "byLayer",
        a: params.a,
        b: params.b,
      };
      draft.entities[id] = castDraft(entity);
      draft.entityOrder.push(id);
    },
    inverse(draft: Draft<Drawing>) {
      delete draft.entities[id];
      const i = draft.entityOrder.indexOf(id);
      if (i >= 0) draft.entityOrder.splice(i, 1);
    },
  };
}
