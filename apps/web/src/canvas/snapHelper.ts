// US1-minimal snap helper. The full SnapEngine + indexing lives in
// @modcad/core; for US1 we just need endpoint-snap so the rectangle/line
// tool can latch to existing geometry per acceptance scenario 2.
//
// The Phase-3 snap agent will replace this with a proper SnapEngine
// hookup against the spatial index; until then this is a tight pure
// function that scans the active drawing's known endpoints.
import {
  listVisibleEntities,
  type Drawing,
  type Vec2Type,
} from "@modcad/core";

export interface SnapHit {
  /** Snapped world coordinate (use this instead of the raw cursor). */
  point: Vec2Type;
  /** Squared screen-pixel distance from the cursor — useful for sorting. */
  distancePx: number;
}

/** Threshold in screen pixels at which a snap engages. */
const RADIUS_PX = 12;

/**
 * Try to snap `cursor` (world) to the nearest endpoint in `drawing`.
 * Returns null if no endpoint is within the screen-pixel radius.
 */
export function snapEndpoint(
  cursor: Vec2Type,
  drawing: Drawing | null,
  zoom: number,
): SnapHit | null {
  if (!drawing) return null;
  const radiusWorld = RADIUS_PX / Math.max(zoom, 1e-9);
  const r2 = radiusWorld * radiusWorld;
  let best: { point: Vec2Type; d2: number } | null = null;
  const consider = (p: Vec2Type): void => {
    const dx = p[0] - cursor[0];
    const dy = p[1] - cursor[1];
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2 && (best === null || d2 < best.d2)) {
      best = { point: [p[0], p[1]], d2 };
    }
  };
  for (const e of listVisibleEntities(drawing)) {
    switch (e.kind) {
      case "line":
        consider(e.a);
        consider(e.b);
        break;
      case "polyline":
        for (const v of e.vertices) consider(v.p);
        break;
      case "circle":
      case "arc":
      case "ellipse":
        consider(e.c);
        break;
      case "point":
        consider(e.p);
        break;
      default:
        break;
    }
  }
  if (best === null) return null;
  const hit = best as { point: Vec2Type; d2: number };
  return { point: hit.point, distancePx: Math.sqrt(hit.d2) * zoom };
}
