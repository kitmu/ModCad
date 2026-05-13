// T081 — aligned-dimension command.
//
// Aligned dimensions measure the straight-line distance between two
// points and draw the dimension line parallel to the segment joining
// them. Endpoints may be raw `Vec2` literals or `EntityPointRef` so
// the dimension reflows when the host entity moves.
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

export interface AlignedDimensionParams {
  a: Vec2 | EntityPointRef;
  b: Vec2 | EntityPointRef;
  /** Perpendicular offset from the AB segment (drawing units). */
  offset: number;
  /** Optional dimension style override; defaults to the drawing's default. */
  styleId?: Id;
  /** Optional layer override; defaults to the current layer. */
  layerId?: Id;
  color?: ColorRef;
  lineweight?: LineweightRef;
}

export function alignedDimensionCommand(
  params: AlignedDimensionParams,
): Command<AlignedDimensionParams> & { entityId: Id } {
  const id = newId();
  return {
    name: "draw.dimension.aligned",
    params,
    entityId: id,
    apply(draft: Draft<Drawing>) {
      const dim: DimensionEntity = {
        id,
        kind: "dimension",
        layerId: params.layerId ?? draft.currentLayerId,
        color: params.color ?? "byLayer",
        lineweight: params.lineweight ?? "byLayer",
        variant: "aligned",
        refs: { variant: "aligned", a: params.a, b: params.b },
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
