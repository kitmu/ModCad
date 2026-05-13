// Boolean-flag layer commands — visible, locked, frozen.
// Each is structurally identical; we share one factory and export
// thin wrappers per the file-per-command convention.
import type { Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Drawing, Layer } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { LayerNotFoundError } from "./errors.js";

type BooleanLayerKey = "visible" | "locked" | "frozen";

interface FlagParams {
  id: Id;
  value: boolean;
}

function setLayerFlagCommand(
  name: string,
  key: BooleanLayerKey,
  params: FlagParams,
  drawing: Drawing,
): Command<FlagParams> {
  const layer = drawing.layers.find((l) => l.id === params.id);
  if (!layer) throw new LayerNotFoundError(params.id);
  const prev = layer[key];
  return {
    name,
    params,
    apply(draft: Draft<Drawing>) {
      const l = draft.layers.find((x) => x.id === params.id);
      if (l) (l as Layer)[key] = params.value;
    },
    inverse(draft: Draft<Drawing>) {
      const l = draft.layers.find((x) => x.id === params.id);
      if (l) (l as Layer)[key] = prev;
    },
  };
}

export type SetLayerVisibleParams = FlagParams;
export type SetLayerLockedParams = FlagParams;
export type SetLayerFrozenParams = FlagParams;

export function setLayerVisibleCommand(
  params: SetLayerVisibleParams,
  drawing: Drawing,
): Command<SetLayerVisibleParams> {
  return setLayerFlagCommand("layers.setVisible", "visible", params, drawing);
}

export function setLayerLockedCommand(
  params: SetLayerLockedParams,
  drawing: Drawing,
): Command<SetLayerLockedParams> {
  return setLayerFlagCommand("layers.setLocked", "locked", params, drawing);
}

export function setLayerFrozenCommand(
  params: SetLayerFrozenParams,
  drawing: Drawing,
): Command<SetLayerFrozenParams> {
  return setLayerFlagCommand("layers.setFrozen", "frozen", params, drawing);
}
