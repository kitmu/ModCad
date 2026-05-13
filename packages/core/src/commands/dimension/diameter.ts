// T081 — diameter-dimension command.
//
// Sibling of radial.ts. Same binding semantics; the value displayed is
// 2*r and prefixed with the diameter glyph at render time.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type {
  ColorRef,
  DimensionEntity,
  Drawing,
  LineweightRef,
} from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { bindDimension, unbindDimension } from "./bindRefs.js";

export interface DiameterDimensionParams {
  entity: Id;
  offset: number;
  styleId?: Id;
  layerId?: Id;
  color?: ColorRef;
  lineweight?: LineweightRef;
}

export function diameterDimensionCommand(
  params: DiameterDimensionParams,
): Command<DiameterDimensionParams> & { entityId: Id } {
  const id = newId();
  return {
    name: "draw.dimension.diameter",
    params,
    entityId: id,
    apply(draft: Draft<Drawing>) {
      const dim: DimensionEntity = {
        id,
        kind: "dimension",
        layerId: params.layerId ?? draft.currentLayerId,
        color: params.color ?? "byLayer",
        lineweight: params.lineweight ?? "byLayer",
        variant: "diameter",
        refs: { variant: "diameter", entity: params.entity },
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
