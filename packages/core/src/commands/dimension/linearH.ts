// T081 — horizontal linear-dimension command (axis: "x").
//
// Measures the horizontal distance between two points; the dimension
// line sits parallel to the X axis. Backing data is the unified
// "linear" variant on DimensionRef with `axis: "x"`.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type {
  ColorRef,
  DimensionEntity,
  Drawing,
  EntityPointRef,
  LineweightRef,
} from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { bindDimension, unbindDimension } from "./bindRefs.js";

export interface LinearHDimensionParams {
  a: Vec2 | EntityPointRef;
  b: Vec2 | EntityPointRef;
  offset: number;
  styleId?: Id;
  layerId?: Id;
  color?: ColorRef;
  lineweight?: LineweightRef;
}

export function linearHDimensionCommand(
  params: LinearHDimensionParams,
): Command<LinearHDimensionParams> & { entityId: Id } {
  const id = newId();
  return {
    name: "draw.dimension.linearH",
    params,
    entityId: id,
    apply(draft: Draft<Drawing>) {
      const dim: DimensionEntity = {
        id,
        kind: "dimension",
        layerId: params.layerId ?? draft.currentLayerId,
        color: params.color ?? "byLayer",
        lineweight: params.lineweight ?? "byLayer",
        variant: "linear",
        refs: { variant: "linear", a: params.a, b: params.b, axis: "x" },
        offset: params.offset,
        styleId: params.styleId ?? draft.defaultDimensionStyleId,
      };
      draft.entities[id] = castDraft(dim);
      draft.entityOrder.push(id);
      bindDimension(dim);
    },
    inverse(draft: Draft<Drawing>) {
      const existing = draft.entities[id];
      if (existing && existing.kind === "dimension") {
        unbindDimension(existing as DimensionEntity);
      }
      delete draft.entities[id];
      const i = draft.entityOrder.indexOf(id);
      if (i >= 0) draft.entityOrder.splice(i, 1);
    },
  };
}
