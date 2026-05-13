// modify.setEntityLayer — FR-011. Reassign one entity to a different layer.
//
// Rejects mutation when the entity's CURRENT layer is locked or frozen
// (per US3 acceptance scenario 4 — locked layers cannot be modified).
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import {
  LayerFrozenError,
  LayerLockedError,
  LayerNotFoundError,
} from "../layers/errors.js";

export interface SetEntityLayerParams {
  entityId: Id;
  layerId: Id;
}

export function setEntityLayerCommand(
  params: SetEntityLayerParams,
  drawing: Drawing,
): Command<SetEntityLayerParams> {
  const entity = drawing.entities[params.entityId];
  if (!entity) throw new Error(`entity ${params.entityId} not found`);
  const current = drawing.layers.find((l) => l.id === entity.layerId);
  if (current?.locked) throw new LayerLockedError(current.id, current.name);
  if (current?.frozen) throw new LayerFrozenError(current.id, current.name);
  const next = drawing.layers.find((l) => l.id === params.layerId);
  if (!next) throw new LayerNotFoundError(params.layerId);
  const prevLayerId = entity.layerId;
  return {
    name: "modify.setEntityLayer",
    params,
    apply(draft: Draft<Drawing>) {
      const e = draft.entities[params.entityId];
      if (e) e.layerId = params.layerId;
    },
    inverse(draft: Draft<Drawing>) {
      const e = draft.entities[params.entityId];
      if (e) e.layerId = prevLayerId;
    },
  };
}
