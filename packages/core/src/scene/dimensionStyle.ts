// T083 — Dimension style data (FR-013).
//
// One project-wide style record on the Drawing with named variants
// (`Drawing.dimensionStyles`) and a default-style pointer
// (`Drawing.defaultDimensionStyleId`). DimensionEntity.styleId resolves
// against this map, mirroring the byLayer/effectiveStyle pattern in
// scene/effectiveStyle.ts. Adding the fields cleanly on `Drawing`
// (not via `extra`) is fine here — no other agent is mid-flight on
// scene/types.ts on this branch (git status confirms).
import type { Draft } from "immer";
import type { Id } from "../ids.js";
import { newId } from "../ids.js";
import type { Command } from "../commands/CommandBus.js";
import type { ColorRef, Drawing } from "./types.js";

/** Arrowhead form per FR-013 dimension style. */
export type DimensionArrowType = "closed-filled" | "open" | "tick" | "none";

export interface DimensionStyle {
  id: Id;
  name: string;
  arrowType: DimensionArrowType;
  /** Arrow size in drawing units. */
  arrowSize: number;
  /** Text glyph height in drawing units. */
  textHeight: number;
  textColor: ColorRef;
  /** Gap between geometry and the foot of the extension line. */
  extensionLineGap: number;
  /** Distance from referenced geometry to the dimension line. */
  dimensionLineOffset: number;
  /** Decimal precision (digits after the radix). 0–6 per data-model.md. */
  precision: number;
  /** When true, trailing zeros after the decimal are suppressed. */
  suppressZeros: boolean;
}

/** The single seeded "Standard" style every new drawing carries. */
export function defaultDimensionStyle(): DimensionStyle {
  return {
    id: newId(),
    name: "Standard",
    arrowType: "closed-filled",
    arrowSize: 2.5,
    textHeight: 2.5,
    textColor: "byLayer",
    extensionLineGap: 0.625,
    dimensionLineOffset: 8,
    precision: 3,
    suppressZeros: false,
  };
}

/** Look up a style; falls back to the default. Never returns undefined. */
export function getDimensionStyle(d: Drawing, id: Id | undefined): DimensionStyle {
  const styles = d.dimensionStyles;
  const fallbackId = d.defaultDimensionStyleId;
  if (id && styles[id]) return styles[id]!;
  return styles[fallbackId]!;
}

// T083 — `createDimensionStyle` command.
//
// Clones an existing style (or the default) and applies optional
// overrides, pushing the new record into `Drawing.dimensionStyles`.
// Undoable: inverse removes the freshly-added style. Like the draw
// commands, the id is allocated at construction so apply/inverse/redo
// see one stable identity.

export interface CreateDimensionStyleParams {
  /** Display name. Must be non-empty. */
  name: string;
  /** Style to clone before applying overrides; falls back to default. */
  base?: Id;
  /** Optional partial overrides applied on top of the cloned style. */
  overrides?: Partial<Omit<DimensionStyle, "id" | "name">>;
}

export interface CreateDimensionStyleResult {
  styleId: Id;
}

export function createDimensionStyleCommand(
  params: CreateDimensionStyleParams,
): Command<CreateDimensionStyleParams> & { result: CreateDimensionStyleResult } {
  if (params.name.trim().length === 0) {
    throw new Error("createDimensionStyle: name must be non-empty");
  }
  const newStyleId = newId();
  const result: CreateDimensionStyleResult = { styleId: newStyleId };
  return {
    name: "settings.createDimensionStyle",
    params,
    result,
    apply(draft: Draft<Drawing>) {
      const baseId = params.base ?? draft.defaultDimensionStyleId;
      const base = draft.dimensionStyles[baseId] ?? draft.dimensionStyles[draft.defaultDimensionStyleId]!;
      const next: DimensionStyle = {
        id: newStyleId,
        name: params.name,
        arrowType: base.arrowType,
        arrowSize: base.arrowSize,
        textHeight: base.textHeight,
        textColor: base.textColor,
        extensionLineGap: base.extensionLineGap,
        dimensionLineOffset: base.dimensionLineOffset,
        precision: base.precision,
        suppressZeros: base.suppressZeros,
        ...params.overrides,
      };
      draft.dimensionStyles[newStyleId] = next;
    },
    inverse(draft: Draft<Drawing>) {
      delete draft.dimensionStyles[newStyleId];
    },
  };
}
