// modify.setEntityLineweight — FR-011. Per-entity lineweight override.
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing, LineweightRef } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { LayerFrozenError, LayerLockedError } from "../layers/errors.js";

export interface SetEntityLineweightParams {
  entityId: Id;
  lineweight: LineweightRef;
}

export function setEntityLineweightCommand(
  params: SetEntityLineweightParams,
  drawing: Drawing,
): Command<SetEntityLineweightParams> {
  const entity = drawing.entities[params.entityId];
  if (!entity) throw new Error(`entity ${params.entityId} not found`);
  const layer = drawing.layers.find((l) => l.id === entity.layerId);
  if (layer?.locked) throw new LayerLockedError(layer.id, layer.name);
  if (layer?.frozen) throw new LayerFrozenError(layer.id, layer.name);
  const prev = entity.lineweight;
  return {
    name: "modify.setEntityLineweight",
    params,
    apply(draft: Draft<Drawing>) {
      const e = draft.entities[params.entityId];
      if (e) e.lineweight = params.lineweight;
    },
    inverse(draft: Draft<Drawing>) {
      const e = draft.entities[params.entityId];
      if (e) e.lineweight = prev;
    },
  };
}
