// 3x3 affine transform matrix in column-major order (matches WebGPU and
// most GPU APIs).
//
// Layout (column-major):
//   [ m00, m01, m02 ]      m00 m10 m20
//   [ m10, m11, m12 ]  =>  m01 m11 m21
//   [ m20, m21, m22 ]      m02 m12 m22
//
// For 2D, m02/m12 are translation, m20/m21 are 0, m22 is 1.
import type { Vec2 } from "./Vec2.js";

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function translate(tx: number, ty: number): Mat3 {
  return [1, 0, 0, 0, 1, 0, tx, ty, 1];
}

export function scale(sx: number, sy: number = sx): Mat3 {
  return [sx, 0, 0, 0, sy, 0, 0, 0, 1];
}

export function rotate(theta: number): Mat3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  // C = A * B (column-major: a_col_major * b_col_major reads naturally)
  return [
    a[0] * b[0] + a[3] * b[1] + a[6] * b[2],
    a[1] * b[0] + a[4] * b[1] + a[7] * b[2],
    a[2] * b[0] + a[5] * b[1] + a[8] * b[2],

    a[0] * b[3] + a[3] * b[4] + a[6] * b[5],
    a[1] * b[3] + a[4] * b[4] + a[7] * b[5],
    a[2] * b[3] + a[5] * b[4] + a[8] * b[5],

    a[0] * b[6] + a[3] * b[7] + a[6] * b[8],
    a[1] * b[6] + a[4] * b[7] + a[7] * b[8],
    a[2] * b[6] + a[5] * b[7] + a[8] * b[8],
  ];
}

export function transform(m: Mat3, p: Vec2): Vec2 {
  return [
    m[0] * p[0] + m[3] * p[1] + m[6],
    m[1] * p[0] + m[4] * p[1] + m[7],
  ];
}
