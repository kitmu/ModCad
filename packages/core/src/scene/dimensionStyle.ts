// T083 — Dimension style data (FR-013).
//
// One project-wide style record on the Drawing with named variants
// (`Drawing.dimensionStyles`) and a default-style pointer
// (`Drawing.defaultDimensionStyleId`). DimensionEntity.styleId resolves
// against this map, mirroring the byLayer/effectiveStyle pattern in
// scene/effectiveStyle.ts. Adding the fields cleanly on `Drawing`
// (not via `extra`) is fine here — no other agent is mid-flight on
// scene/types.ts on this branch (git status confirms).
import type { Id } from "../ids.js";
import { newId } from "../ids.js";
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
