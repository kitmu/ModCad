// layers.setCurrent — FR-010. Change Drawing.currentLayerId.
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { LayerNotFoundError } from "./errors.js";

export interface SetCurrentLayerParams {
  id: Id;
}

export function setCurrentLayerCommand(
  params: SetCurrentLayerParams,
  drawing: Drawing,
): Command<SetCurrentLayerParams> {
  if (!drawing.layers.some((l) => l.id === params.id)) {
    throw new LayerNotFoundError(params.id);
  }
  const prev = drawing.currentLayerId;
  return {
    name: "layers.setCurrent",
    params,
    apply(draft: Draft<Drawing>) {
      draft.currentLayerId = params.id;
    },
    inverse(draft: Draft<Drawing>) {
      draft.currentLayerId = prev;
    },
  };
}
