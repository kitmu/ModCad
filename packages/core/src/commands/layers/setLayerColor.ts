// layers.setColor — FR-010. Setting a layer's color updates every
// entity whose color resolves byLayer to that layer through
// effectiveStyle (no entity mutation needed).
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing, RGBA } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { LayerNotFoundError } from "./errors.js";

export interface SetLayerColorParams {
  id: Id;
  color: RGBA;
}

export function setLayerColorCommand(
  params: SetLayerColorParams,
  drawing: Drawing,
): Command<SetLayerColorParams> {
  const layer = drawing.layers.find((l) => l.id === params.id);
  if (!layer) throw new LayerNotFoundError(params.id);
  const prev = layer.color;
  return {
    name: "layers.setColor",
    params,
    apply(draft: Draft<Drawing>) {
      const l = draft.layers.find((x) => x.id === params.id);
      if (l) l.color = params.color;
    },
    inverse(draft: Draft<Drawing>) {
      const l = draft.layers.find((x) => x.id === params.id);
      if (l) l.color = prev;
    },
  };
}
