// Axis-aligned bounding box. Used by the spatial index and the camera
// fit-to-extents command.
import type { Vec2 } from "./Vec2.js";

export interface Bbox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Empty (inverted) box. Union with anything else returns the other box. */
export const EMPTY: Bbox = {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
};

export function isEmpty(b: Bbox): boolean {
  return b.minX > b.maxX || b.minY > b.maxY;
}

export function fromPoints(points: readonly Vec2[]): Bbox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

export function fromPoint(p: Vec2): Bbox {
  return { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] };
}

export function union(a: Bbox, b: Bbox): Bbox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function contains(b: Bbox, p: Vec2): boolean {
  return p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY;
}

export function intersects(a: Bbox, b: Bbox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function expand(b: Bbox, by: number): Bbox {
  return { minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by };
}

export function width(b: Bbox): number {
  return b.maxX - b.minX;
}

export function height(b: Bbox): number {
  return b.maxY - b.minY;
}

export function center(b: Bbox): Vec2 {
  return [(b.minX + b.maxX) * 0.5, (b.minY + b.maxY) * 0.5];
}
