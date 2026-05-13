// modify.setEntityColor — FR-011. Per-entity color override (or byLayer).
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { ColorRef, Drawing } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { LayerFrozenError, LayerLockedError } from "../layers/errors.js";

export interface SetEntityColorParams {
  entityId: Id;
  color: ColorRef;
}

export function setEntityColorCommand(
  params: SetEntityColorParams,
  drawing: Drawing,
): Command<SetEntityColorParams> {
  const entity = drawing.entities[params.entityId];
  if (!entity) throw new Error(`entity ${params.entityId} not found`);
  const layer = drawing.layers.find((l) => l.id === entity.layerId);
  if (layer?.locked) throw new LayerLockedError(layer.id, layer.name);
  if (layer?.frozen) throw new LayerFrozenError(layer.id, layer.name);
  const prev = entity.color;
  return {
    name: "modify.setEntityColor",
    params,
    apply(draft: Draft<Drawing>) {
      const e = draft.entities[params.entityId];
      if (e) e.color = params.color;
    },
    inverse(draft: Draft<Drawing>) {
      const e = draft.entities[params.entityId];
      if (e) e.color = prev;
    },
  };
}
