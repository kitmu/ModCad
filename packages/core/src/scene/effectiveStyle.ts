// Renderer-side byLayer resolution — FR-011.
//
// Entities carry ColorRef = "byLayer" | RGBA and LineweightRef =
// "byLayer" | number. The renderer needs concrete values; callers run
// every entity through these helpers before upserting to the scene
// graph. Keeping the resolution in the kernel (not the renderer)
// ensures DXF/SVG/PDF export get the same resolved values without
// duplicating the lookup table.
import type {
  ColorRef,
  Drawing,
  Entity,
  LineweightRef,
  RGBA,
} from "./types.js";

const FALLBACK_COLOR: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const FALLBACK_LINEWEIGHT = 0.25;

export function effectiveColor(entity: Entity, drawing: Drawing): RGBA {
  if (entity.color !== "byLayer") return entity.color;
  const layer = drawing.layers.find((l) => l.id === entity.layerId);
  return layer?.color ?? FALLBACK_COLOR;
}

export function effectiveLineweight(entity: Entity, drawing: Drawing): number {
  if (entity.lineweight !== "byLayer") return entity.lineweight;
  const layer = drawing.layers.find((l) => l.id === entity.layerId);
  return layer?.lineweight ?? FALLBACK_LINEWEIGHT;
}

/** Layer is hidden if its visible flag is off OR it is frozen. */
export function isHidden(entity: Entity, drawing: Drawing): boolean {
  const layer = drawing.layers.find((l) => l.id === entity.layerId);
  if (!layer) return false;
  return !layer.visible || layer.frozen;
}

/** Same as the entity but with `color` and `lineweight` pre-resolved. */
export function resolveStyle(entity: Entity, drawing: Drawing): Entity {
  const color: ColorRef = effectiveColor(entity, drawing);
  const lineweight: LineweightRef = effectiveLineweight(entity, drawing);
  if (entity.color === color && entity.lineweight === lineweight) return entity;
  return { ...entity, color, lineweight };
}
