// draw.ellipse — FR-001. Full ellipse defaults startParam=0 endParam=2π.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, EllipseEntity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface DrawEllipseParams {
  c: Vec2;
  major: Vec2;
  ratio: number;
  startParam?: number;
  endParam?: number;
  layerId?: Id;
}

export function drawEllipseCommand(
  params: DrawEllipseParams,
): Command<DrawEllipseParams> {
  const id = newId();
  return {
    name: "draw.ellipse",
    params,
    apply(draft: Draft<Drawing>) {
      const entity: EllipseEntity = {
        id,
        kind: "ellipse",
        layerId: params.layerId ?? draft.currentLayerId,
        color: "byLayer",
        lineweight: "byLayer",
        c: params.c,
        major: params.major,
        ratio: params.ratio,
        startParam: params.startParam ?? 0,
        endParam: params.endParam ?? 2 * Math.PI,
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
