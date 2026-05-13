// T081 — angular-dimension command.
//
// Measures the angle between two rays sharing a common vertex. The
// vertex is a raw Vec2 (CAD convention — the user picks a free point);
// the two rays are Vec2 or EntityPointRef so the dimension reflows
// with its anchor entities.
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

export interface AngularDimensionParams {
  vertex: Vec2;
  a: Vec2 | EntityPointRef;
  b: Vec2 | EntityPointRef;
  /** Radius at which the dimension arc is drawn. */
  offset: number;
  styleId?: Id;
  layerId?: Id;
  color?: ColorRef;
  lineweight?: LineweightRef;
}

export function angularDimensionCommand(
  params: AngularDimensionParams,
): Command<AngularDimensionParams> & { entityId: Id } {
  const id = newId();
  return {
    name: "draw.dimension.angular",
    params,
    entityId: id,
    apply(draft: Draft<Drawing>) {
      const dim: DimensionEntity = {
        id,
        kind: "dimension",
        layerId: params.layerId ?? draft.currentLayerId,
        color: params.color ?? "byLayer",
        lineweight: params.lineweight ?? "byLayer",
        variant: "angular",
        refs: {
          variant: "angular",
          v: params.vertex,
          a: params.a,
          b: params.b,
        },
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
