// 2D vector. Immutable readonly tuple — chosen over `{x,y}` because:
//   - tuples destructure cleanly into shader-friendly arrays
//   - structural equality via JSON works for tests
//   - the renderer can pass an instance straight to a vertex buffer
//
// All operations are pure and free of allocation tricks. Hot paths
// (snap/pick/predicate) avoid intermediate Vec2s and operate on
// number components directly — see predicates.ts.
export type Vec2 = readonly [number, number];

export const ZERO: Vec2 = [0, 0];

export function vec(x: number, y: number): Vec2 {
  return [x, y];
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function scale(a: Vec2, k: number): Vec2 {
  return [a[0] * k, a[1] * k];
}

export function dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function cross(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

export function length(a: Vec2): number {
  return Math.hypot(a[0], a[1]);
}

export function lengthSq(a: Vec2): number {
  return a[0] * a[0] + a[1] * a[1];
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

export function normalize(a: Vec2): Vec2 {
  const l = length(a);
  return l > 0 ? [a[0] / l, a[1] / l] : ZERO;
}

export function equals(a: Vec2, b: Vec2, epsilon = 0): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
