// layers.remove — FR-010, FR-012.
//
// Refuses to delete:
//   - the default layer "0" (UndeletableLayerError)
//   - any locked layer (LayerLockedError)
//   - any frozen layer (LayerFrozenError)
//
// Reassigns every entity on the layer to `reassignTo` before removal.
// The inverse restores the layer record at its original layerOrder
// position AND the original layerId for every reassigned entity.
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing, Layer } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import {
  LayerFrozenError,
  LayerLockedError,
  LayerNotFoundError,
  UndeletableLayerError,
} from "./errors.js";

export interface RemoveLayerParams {
  id: Id;
  reassignTo: Id;
}

interface Snapshot {
  layer: Layer;
  orderIndex: number;
  reassignedEntityIds: Id[];
  wasCurrent: boolean;
}

export function removeLayerCommand(
  params: RemoveLayerParams,
  drawing: Drawing,
): Command<RemoveLayerParams> {
  const target = drawing.layers.find((l) => l.id === params.id);
  if (!target) throw new LayerNotFoundError(params.id);
  if (target.name === "0") throw new UndeletableLayerError(target.id, target.name);
  if (target.locked) throw new LayerLockedError(target.id, target.name);
  if (target.frozen) throw new LayerFrozenError(target.id, target.name);
  const reassign = drawing.layers.find((l) => l.id === params.reassignTo);
  if (!reassign) throw new LayerNotFoundError(params.reassignTo);
  if (reassign.id === target.id) {
    throw new Error("removeLayer: reassignTo must differ from id");
  }

  const snapshot: Snapshot = {
    layer: target,
    orderIndex: drawing.layerOrder.indexOf(target.id),
    reassignedEntityIds: drawing.entityOrder.filter(
      (eid) => drawing.entities[eid]?.layerId === target.id,
    ),
    wasCurrent: drawing.currentLayerId === target.id,
  };

  return {
    name: "layers.remove",
    params,
    apply(draft: Draft<Drawing>) {
      for (const eid of snapshot.reassignedEntityIds) {
        const e = draft.entities[eid];
        if (e) e.layerId = params.reassignTo;
      }
      if (snapshot.wasCurrent) {
        draft.currentLayerId = params.reassignTo;
      }
      const li = draft.layers.findIndex((l) => l.id === target.id);
      if (li >= 0) draft.layers.splice(li, 1);
      const oi = draft.layerOrder.indexOf(target.id);
      if (oi >= 0) draft.layerOrder.splice(oi, 1);
    },
    inverse(draft: Draft<Drawing>) {
      // Re-insert at original order index.
      draft.layers.push(snapshot.layer);
      const insertAt = Math.min(snapshot.orderIndex, draft.layerOrder.length);
      draft.layerOrder.splice(insertAt, 0, snapshot.layer.id);
      for (const eid of snapshot.reassignedEntityIds) {
        const e = draft.entities[eid];
        if (e) e.layerId = snapshot.layer.id;
      }
      if (snapshot.wasCurrent) {
        draft.currentLayerId = snapshot.layer.id;
      }
    },
  };
}
