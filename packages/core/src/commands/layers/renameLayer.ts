// layers.rename — FR-010.
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { LayerNotFoundError } from "./errors.js";

export interface RenameLayerParams {
  id: Id;
  name: string;
}

export function renameLayerCommand(
  params: RenameLayerParams,
  drawing: Drawing,
): Command<RenameLayerParams> {
  const layer = drawing.layers.find((l) => l.id === params.id);
  if (!layer) throw new LayerNotFoundError(params.id);
  const prevName = layer.name;
  return {
    name: "layers.rename",
    params,
    apply(draft: Draft<Drawing>) {
      const l = draft.layers.find((x) => x.id === params.id);
      if (l) l.name = params.name;
    },
    inverse(draft: Draft<Drawing>) {
      const l = draft.layers.find((x) => x.id === params.id);
      if (l) l.name = prevName;
    },
  };
}
