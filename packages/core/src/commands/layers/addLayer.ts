// layers.add — FR-010.
//
// Allocates a fresh layer id at command-construction time so undo→redo
// keeps the same identity (matches the draw-command pattern).
import type { Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Drawing, Layer, RGBA } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface AddLayerParams {
  name: string;
  color: RGBA;
  lineweight: number; // mm
  // Optional initial flags; defaults mirror defaultLayer().
  visible?: boolean;
  locked?: boolean;
  frozen?: boolean;
}

export interface AddLayerResult {
  id: Id;
}

export function addLayerCommand(
  params: AddLayerParams,
): Command<AddLayerParams> & AddLayerResult {
  const id = newId();
  return {
    name: "layers.add",
    params,
    id,
    apply(draft: Draft<Drawing>) {
      const layer: Layer = {
        id,
        name: params.name,
        color: params.color,
        lineweight: params.lineweight,
        visible: params.visible ?? true,
        locked: params.locked ?? false,
        frozen: params.frozen ?? false,
      };
      draft.layers.push(layer);
      draft.layerOrder.push(id);
    },
    inverse(draft: Draft<Drawing>) {
      const li = draft.layers.findIndex((l) => l.id === id);
      if (li >= 0) draft.layers.splice(li, 1);
      const oi = draft.layerOrder.indexOf(id);
      if (oi >= 0) draft.layerOrder.splice(oi, 1);
    },
  };
}
