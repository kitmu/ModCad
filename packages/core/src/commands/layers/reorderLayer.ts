// layers.reorder — FR-010. Move a layer within `layerOrder`.
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { LayerNotFoundError } from "./errors.js";

export interface ReorderLayerParams {
  id: Id;
  to: number; // target index within layerOrder
}

export function reorderLayerCommand(
  params: ReorderLayerParams,
  drawing: Drawing,
): Command<ReorderLayerParams> {
  const from = drawing.layerOrder.indexOf(params.id);
  if (from < 0) throw new LayerNotFoundError(params.id);
  const clamp = (n: number): number =>
    Math.max(0, Math.min(drawing.layerOrder.length - 1, n));
  const to = clamp(params.to);
  return {
    name: "layers.reorder",
    params,
    apply(draft: Draft<Drawing>) {
      const i = draft.layerOrder.indexOf(params.id);
      if (i < 0) return;
      const [moved] = draft.layerOrder.splice(i, 1);
      if (moved === undefined) return;
      draft.layerOrder.splice(to, 0, moved);
    },
    inverse(draft: Draft<Drawing>) {
      const i = draft.layerOrder.indexOf(params.id);
      if (i < 0) return;
      const [moved] = draft.layerOrder.splice(i, 1);
      if (moved === undefined) return;
      draft.layerOrder.splice(from, 0, moved);
    },
  };
}
