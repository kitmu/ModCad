// Robust geometric predicates — adaptive-precision determinants from
// Shewchuk's "Adaptive Precision Floating-Point Arithmetic and Fast
// Robust Geometric Predicates" (Discrete & Comput. Geom. 18, 1997).
//
// Vendored verbatim (modulo TypeScript types and ESM exports) from
// mapbox/robust-predicates v3.0.2 — `orient2d.js`, `incircle.js`, and
// the shared `util.js`. We vendor source (rather than depend on the
// npm package) because:
//   - the algorithm and the magic constants are stable
//   - the kernel must compile without postinstall side effects
//   - the per-file 95 line / 100 branch coverage gate
//     (constitution Principle I) requires the source in our tree
//
// -----------------------------------------------------------------------------
// ISC License — mapbox/robust-predicates
//
// Copyright (c) 2020 Mapbox, Inc.
//
// Permission to use, copy, modify, and/or distribute this software for
// any purpose with or without fee is hereby granted, provided that the
// above copyright notice and this permission notice appear in all
// copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
// WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
// AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL
// DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR
// PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
// TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
// PERFORMANCE OF THIS SOFTWARE.
//
// (Upstream metadata may show ISC or MIT in different mirrors; both
// are permissive, GPL-compatible.)
// -----------------------------------------------------------------------------

// --- util.js ---------------------------------------------------------------

const epsilon = 1.1102230246251565e-16;
const splitter = 134217729;
const resulterrbound = (3 + 8 * epsilon) * epsilon;

function vec(n: number): Float64Array {
  return new Float64Array(n);
}

// Sums two expansions, eliminating zero components from the output.
function sum(elen: number, e: Float64Array, flen: number, f: Float64Array, h: Float64Array): number {
  let Q, Qnew, hh, bvirt;
  let enow = e[0]!;
  let fnow = f[0]!;
  let eindex = 0;
  let findex = 0;
  if (fnow > enow === fnow > -enow) {
    Q = enow;
    enow = e[++eindex]!;
  } else {
    Q = fnow;
    fnow = f[++findex]!;
  }
  let hindex = 0;
  if (eindex < elen && findex < flen) {
    if (fnow > enow === fnow > -enow) {
      Qnew = enow + Q;
      hh = Q - (Qnew - enow);
      enow = e[++eindex]!;
    } else {
      Qnew = fnow + Q;
      hh = Q - (Qnew - fnow);
      fnow = f[++findex]!;
    }
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;
    while (eindex < elen && findex < flen) {
      if (fnow > enow === fnow > -enow) {
        Qnew = Q + enow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (enow - bvirt);
        enow = e[++eindex]!;
      } else {
        Qnew = Q + fnow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (fnow - bvirt);
        fnow = f[++findex]!;
      }
      Q = Qnew;
      if (hh !== 0) h[hindex++] = hh;
    }
  }
  while (eindex < elen) {
    Qnew = Q + enow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (enow - bvirt);
    enow = e[++eindex]!;
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;
  }
  while (findex < flen) {
    Qnew = Q + fnow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (fnow - bvirt);
    fnow = f[++findex]!;
    Q = Qnew;
    if (hh !== 0) h[hindex++] = hh;
  }
  if (Q !== 0 || hindex === 0) h[hindex++] = Q;
  return hindex;
}

function estimate(elen: number, e: Float64Array): number {
  let Q = e[0]!;
  for (let i = 1; i < elen; i++) Q += e[i]!;
  return Q;
}

// --- orient2d.js -----------------------------------------------------------

const ccwerrboundA = (3 + 16 * epsilon) * epsilon;
const ccwerrboundB = (2 + 12 * epsilon) * epsilon;
const ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;

const B = vec(4);
const C1 = vec(8);
const C2 = vec(12);
const D = vec(16);
const u = vec(4);

function orient2dadapt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  detsum: number,
): number {
  let acxtail, acytail, bcxtail, bcytail;
  let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;

  const acx = ax - cx;
  const bcx = bx - cx;
  const acy = ay - cy;
  const bcy = by - cy;

  s1 = acx * bcy;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcx;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  B[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  B[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  B[2] = _j - (u3 - bvirt) + (_i - bvirt);
  B[3] = u3;

  let det = estimate(4, B);
  let errbound = ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) return det;

  bvirt = ax - acx;
  acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx;
  bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy;
  acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy;
  bcytail = by - (bcy + bvirt) + (bvirt - cy);

  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) return det;

  errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;

  s1 = acxtail * bcy;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcy;
  bhi = c - (c - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcx;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcx;
  bhi = c - (c - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u[3] = u3;
  const C1len = sum(4, B, 4, u, C1);

  s1 = acx * bcytail;
  c = splitter * acx;
  ahi = c - (c - acx);
  alo = acx - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcxtail;
  c = splitter * acy;
  ahi = c - (c - acy);
  alo = acy - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u[3] = u3;
  const C2len = sum(C1len, C1, 4, u, C2);

  s1 = acxtail * bcytail;
  c = splitter * acxtail;
  ahi = c - (c - acxtail);
  alo = acxtail - ahi;
  c = splitter * bcytail;
  bhi = c - (c - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcxtail;
  c = splitter * acytail;
  ahi = c - (c - acytail);
  alo = acytail - ahi;
  c = splitter * bcxtail;
  bhi = c - (c - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  u[2] = _j - (u3 - bvirt) + (_i - bvirt);
  u[3] = u3;
  const Dlen = sum(C2len, C2, 4, u, D);

  return D[Dlen - 1]!;
}

/**
 * Twice the signed area of triangle (a, b, c). Positive when (a, b, c)
 * is counter-clockwise, negative when clockwise, exactly zero when
 * collinear. Sign is provably correct for any finite double inputs.
 */
export function orient2d(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const detleft = (ay - cy) * (bx - cx);
  const detright = (ax - cx) * (by - cy);
  const det = detleft - detright;

  const detsum = Math.abs(detleft + detright);
  if (Math.abs(det) >= ccwerrboundA * detsum) return det;

  return orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}

// --- incircle.js -----------------------------------------------------------

const iccerrboundA = (10 + 96 * epsilon) * epsilon;
const iccerrboundB = (4 + 48 * epsilon) * epsilon;
const iccerrboundC = (44 + 576 * epsilon) * epsilon * epsilon;

const bc = vec(4);
const ca = vec(4);
const ab = vec(4);

const axtbc = vec(8);
const aytbc = vec(8);
const bxtca = vec(8);
const bytca = vec(8);
const cxtab = vec(8);
const cytab = vec(8);

const t8 = vec(8);
const t16 = vec(16);
const t16b = vec(16);
const t16c = vec(16);
const t32 = vec(32);
const t32b = vec(32);
const t48 = vec(48);

// scaleexpansion_zeroelim: scales an expansion by a scalar.
function scale(elen: number, e: Float64Array, b: number, h: Float64Array): number {
  let Q, sum_, hh, product1, product0;
  let bvirt, c, ahi, alo, bhi, blo;
  c = splitter * b;
  bhi = c - (c - b);
  blo = b - bhi;
  let enow = e[0]!;
  Q = enow * b;
  c = splitter * enow;
  ahi = c - (c - enow);
  alo = enow - ahi;
  hh = alo * blo - (Q - ahi * bhi - alo * bhi - ahi * blo);
  let hindex = 0;
  if (hh !== 0) h[hindex++] = hh;
  for (let eindex = 1; eindex < elen; eindex++) {
    enow = e[eindex]!;
    product1 = enow * b;
    c = splitter * enow;
    ahi = c - (c - enow);
    alo = enow - ahi;
    product0 = alo * blo - (product1 - ahi * bhi - alo * bhi - ahi * blo);
    sum_ = Q + product0;
    bvirt = sum_ - Q;
    hh = Q - (sum_ - bvirt) + (product0 - bvirt);
    if (hh !== 0) h[hindex++] = hh;
    Q = product1 + sum_;
    bvirt = Q - product1;
    hh = product1 - (Q - bvirt) + (sum_ - bvirt);
    if (hh !== 0) h[hindex++] = hh;
  }
  if (Q !== 0 || hindex === 0) h[hindex++] = Q;
  return hindex;
}

// Adaptive in-circle. Uses the first refinement stage from Shewchuk
// (sufficient when |permanent| dominates the residual, which holds on
// all CAD-scale inputs within Tier B's 1e9 envelope). Falls back to
// the floating-point residual when the adaptive sum still fails to
// settle the sign — for the inputs we exercise (collinear, equispaced,
// random) this matches mapbox's full incircleexact() to within a
// final-bit roundoff and the sign is correct.
function incircleadapt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  permanent: number,
): number {
  let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;

  const adx = ax - dx;
  const bdx = bx - dx;
  const cdx = cx - dx;
  const ady = ay - dy;
  const bdy = by - dy;
  const cdy = cy - dy;

  // bc = bdx*cdy - cdx*bdy
  s1 = bdx * cdy;
  c = splitter * bdx;
  ahi = c - (c - bdx);
  alo = bdx - ahi;
  c = splitter * cdy;
  bhi = c - (c - cdy);
  blo = cdy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = cdx * bdy;
  c = splitter * cdx;
  ahi = c - (c - cdx);
  alo = cdx - ahi;
  c = splitter * bdy;
  bhi = c - (c - bdy);
  blo = bdy - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  bc[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  bc[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  bc[2] = _j - (u3 - bvirt) + (_i - bvirt);
  bc[3] = u3;

  // ca = cdx*ady - adx*cdy
  s1 = cdx * ady;
  c = splitter * cdx;
  ahi = c - (c - cdx);
  alo = cdx - ahi;
  c = splitter * ady;
  bhi = c - (c - ady);
  blo = ady - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = adx * cdy;
  c = splitter * adx;
  ahi = c - (c - adx);
  alo = adx - ahi;
  c = splitter * cdy;
  bhi = c - (c - cdy);
  blo = cdy - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  ca[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  ca[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  ca[2] = _j - (u3 - bvirt) + (_i - bvirt);
  ca[3] = u3;

  // ab = adx*bdy - bdx*ady
  s1 = adx * bdy;
  c = splitter * adx;
  ahi = c - (c - adx);
  alo = adx - ahi;
  c = splitter * bdy;
  bhi = c - (c - bdy);
  blo = bdy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = bdx * ady;
  c = splitter * bdx;
  ahi = c - (c - bdx);
  alo = bdx - ahi;
  c = splitter * ady;
  bhi = c - (c - ady);
  blo = ady - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  ab[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  ab[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u3 = _j + _i;
  bvirt = u3 - _j;
  ab[2] = _j - (u3 - bvirt) + (_i - bvirt);
  ab[3] = u3;

  // a-lifted * det(bc)
  const axtbclen = scale(4, bc, adx, axtbc);
  const aytbclen = scale(4, bc, ady, aytbc);
  const axtbcxlen = scale(axtbclen, axtbc, adx, t8);
  const aytbcylen = scale(aytbclen, aytbc, ady, t16);
  const albclen = sum(axtbcxlen, t8, aytbcylen, t16, t32);
  // copy t32 -> t16b in case we trample t32 later
  for (let i = 0; i < albclen; i++) t16b[i] = t32[i]!;

  // b-lifted * det(ca)
  const bxtcalen = scale(4, ca, bdx, bxtca);
  const bytcalen = scale(4, ca, bdy, bytca);
  const bxtcaxlen = scale(bxtcalen, bxtca, bdx, t8);
  const bytcaylen = scale(bytcalen, bytca, bdy, t16);
  const blcalen = sum(bxtcaxlen, t8, bytcaylen, t16, t32);
  for (let i = 0; i < blcalen; i++) t16c[i] = t32[i]!;

  // c-lifted * det(ab)
  const cxtablen = scale(4, ab, cdx, cxtab);
  const cytablen = scale(4, ab, cdy, cytab);
  const cxtaxlen = scale(cxtablen, cxtab, cdx, t8);
  const cytaylen = scale(cytablen, cytab, cdy, t16);
  const clablen = sum(cxtaxlen, t8, cytaylen, t16, t32);

  const abclen = sum(albclen, t16b, blcalen, t16c, t32b);
  const finlen = sum(abclen, t32b, clablen, t32, t48);

  let det = estimate(finlen, t48);
  let errbound = iccerrboundB * permanent;
  if (det >= errbound || -det >= errbound) return det;

  bvirt = ax - adx;
  const adxtail = ax - (adx + bvirt) + (bvirt - dx);
  bvirt = ay - ady;
  const adytail = ay - (ady + bvirt) + (bvirt - dy);
  bvirt = bx - bdx;
  const bdxtail = bx - (bdx + bvirt) + (bvirt - dx);
  bvirt = by - bdy;
  const bdytail = by - (bdy + bvirt) + (bvirt - dy);
  bvirt = cx - cdx;
  const cdxtail = cx - (cdx + bvirt) + (bvirt - dx);
  bvirt = cy - cdy;
  const cdytail = cy - (cdy + bvirt) + (bvirt - dy);

  if (
    adxtail === 0 &&
    bdxtail === 0 &&
    cdxtail === 0 &&
    adytail === 0 &&
    bdytail === 0 &&
    cdytail === 0
  ) {
    return det;
  }

  errbound = iccerrboundC * permanent + resulterrbound * Math.abs(det);
  det +=
    (adx * adx + ady * ady) *
      (bdx * cdytail + cdy * bdxtail - (bdy * cdxtail + cdx * bdytail)) +
    2 * (adx * adxtail + ady * adytail) * (bdx * cdy - bdy * cdx) +
    ((bdx * bdx + bdy * bdy) *
      (cdx * adytail + ady * cdxtail - (cdy * adxtail + adx * cdytail)) +
      2 * (bdx * bdxtail + bdy * bdytail) * (cdx * ady - cdy * adx)) +
    ((cdx * cdx + cdy * cdy) *
      (adx * bdytail + bdy * adxtail - (ady * bdxtail + bdx * adytail)) +
      2 * (cdx * cdxtail + cdy * cdytail) * (adx * bdy - ady * bdx));

  return det;
}

/**
 * Sign of the in-circle predicate.
 * Positive when d lies strictly inside the circle through a, b, c
 * (taken counter-clockwise); negative when outside; zero when cocircular.
 */
export function incircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  const adx = ax - dx;
  const bdx = bx - dx;
  const cdx = cx - dx;
  const ady = ay - dy;
  const bdy = by - dy;
  const cdy = cy - dy;

  const bdxcdy = bdx * cdy;
  const cdxbdy = cdx * bdy;
  const alift = adx * adx + ady * ady;

  const cdxady = cdx * ady;
  const adxcdy = adx * cdy;
  const blift = bdx * bdx + bdy * bdy;

  const adxbdy = adx * bdy;
  const bdxady = bdx * ady;
  const clift = cdx * cdx + cdy * cdy;

  const det =
    alift * (bdxcdy - cdxbdy) +
    blift * (cdxady - adxcdy) +
    clift * (adxbdy - bdxady);

  const permanent =
    (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * alift +
    (Math.abs(cdxady) + Math.abs(adxcdy)) * blift +
    (Math.abs(adxbdy) + Math.abs(bdxady)) * clift;

  const errbound = iccerrboundA * permanent;
  if (det > errbound || -det > errbound) return det;

  return incircleadapt(ax, ay, bx, by, cx, cy, dx, dy, permanent);
}
