// layers.setLineweight — FR-010.
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { LayerNotFoundError } from "./errors.js";

export interface SetLayerLineweightParams {
  id: Id;
  lineweight: number; // mm
}

export function setLayerLineweightCommand(
  params: SetLayerLineweightParams,
  drawing: Drawing,
): Command<SetLayerLineweightParams> {
  const layer = drawing.layers.find((l) => l.id === params.id);
  if (!layer) throw new LayerNotFoundError(params.id);
  const prev = layer.lineweight;
  return {
    name: "layers.setLineweight",
    params,
    apply(draft: Draft<Drawing>) {
      const l = draft.layers.find((x) => x.id === params.id);
      if (l) l.lineweight = params.lineweight;
    },
    inverse(draft: Draft<Drawing>) {
      const l = draft.layers.find((x) => x.id === params.id);
      if (l) l.lineweight = prev;
    },
  };
}
