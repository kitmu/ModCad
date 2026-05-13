// draw.point — FR-001. Per-entity style override is optional; when
// absent the renderer falls back to DrawingSettings.pointStyle.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type {
  Drawing,
  PointEntity,
  PointStyle,
} from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface DrawPointParams {
  p: Vec2;
  layerId?: Id;
  styleOverride?: PointStyle;
}

export function drawPointCommand(
  params: DrawPointParams,
): Command<DrawPointParams> {
  const id = newId();
  return {
    name: "draw.point",
    params,
    apply(draft: Draft<Drawing>) {
      const entity: PointEntity = {
        id,
        kind: "point",
        layerId: params.layerId ?? draft.currentLayerId,
        color: "byLayer",
        lineweight: "byLayer",
        p: params.p,
        ...(params.styleOverride ? { styleOverride: params.styleOverride } : {}),
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
