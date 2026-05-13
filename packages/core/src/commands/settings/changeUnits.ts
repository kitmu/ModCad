// settings.changeUnits — FR-015b. Switches Drawing.units (+ optional
// precision). Never rescales geometry: coordinate values keep their
// numeric value and only their display representation changes.
import type { Draft } from "immer";
import type { Drawing, Unit } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface ChangeUnitsParams {
  units: Unit;
  precision?: number;
}

export function changeUnitsCommand(
  params: ChangeUnitsParams,
  drawing: Drawing,
): Command<ChangeUnitsParams> {
  const prevUnits = drawing.units;
  const prevPrecision = drawing.precision;
  return {
    name: "settings.changeUnits",
    params,
    apply(draft: Draft<Drawing>) {
      draft.units = params.units;
      if (params.precision !== undefined) {
        draft.precision = params.precision;
      }
    },
    inverse(draft: Draft<Drawing>) {
      draft.units = prevUnits;
      if (params.precision !== undefined) {
        draft.precision = prevPrecision;
      }
    },
  };
}
