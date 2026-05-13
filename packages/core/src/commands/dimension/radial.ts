// T081 — radial-dimension command.
//
// Measures the radius of a circle or arc and labels it with an "R"
// prefix. The dimension always binds to a single host entity id; the
// radius is read live from the entity at render time so no further
// re-flow plumbing is required for grip edits to the radius.
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

export interface RadialDimensionParams {
  entity: Id;
  offset: number;
  styleId?: Id;
  layerId?: Id;
  color?: ColorRef;
  lineweight?: LineweightRef;
}

export function radialDimensionCommand(
  params: RadialDimensionParams,
): Command<RadialDimensionParams> & { entityId: Id } {
  const id = newId();
  return {
    name: "draw.dimension.radial",
    params,
    entityId: id,
    apply(draft: Draft<Drawing>) {
      const dim: DimensionEntity = {
        id,
        kind: "dimension",
        layerId: params.layerId ?? draft.currentLayerId,
        color: params.color ?? "byLayer",
        lineweight: params.lineweight ?? "byLayer",
        variant: "radial",
        refs: { variant: "radial", entity: params.entity },
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
