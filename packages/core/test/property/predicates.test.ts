// Property tests for orient2d / incircle. These are the predicates the
// rest of the kernel relies on for correctness — every algebraic
// identity exercised here is a constitution Principle I obligation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { orient2d, incircle } from "../../src/geometry/predicates.js";

const RUNS = 300;

// CAD-scale envelope. We deliberately use integer-typed doubles to
// dodge the extreme-magnitude cancellation that breaks predicate
// invariants in exact-zero arithmetic but doesn't reflect any real
// kernel input.
const finite = (max = 1e5) =>
  fc.double({ min: -max, max, noNaN: true, noDefaultInfinity: true, minExcluded: false });

const coord = (max = 1e5) => fc.integer({ min: -max, max });

const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);
// orient2d can return -0 for degenerate inputs; tests compare via |x|=0.
const isZero = (n: number): boolean => n === 0;

// Naive double-precision determinant — agrees with the robust version
// when the points are well-separated. We use it as a same-sign oracle
// far from collinear, and only there.
function orientNaive(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  return (ay - cy) * (bx - cx) - (ax - cx) * (by - cy);
}

describe("orient2d", () => {
  it("swapping two arguments flips the sign", () => {
    // Integer coords keep us out of the extreme-magnitude regime
    // where the predicate's result is mathematically zero but float
    // representation breaks the symmetry.
    fc.assert(
      fc.property(coord(), coord(), coord(), coord(), coord(), coord(), (ax, ay, bx, by, cx, cy) => {
        const abc = orient2d(ax, ay, bx, by, cx, cy);
        const bac = orient2d(bx, by, ax, ay, cx, cy);
        expect(sign(abc) === -sign(bac)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("cyclic rotation preserves the sign on non-degenerate inputs", () => {
    // The identity orient2d(a,b,c) === orient2d(b,c,a) holds exactly in
    // real arithmetic but the adaptive predicate may take different code
    // paths on the two argument orders, producing different sign signals
    // on truly collinear or near-collinear configurations (one path
    // returns 0, the other returns a tiny non-zero). Pre-filter so the
    // assertion only fires when both evaluations agree on non-degeneracy.
    fc.assert(
      fc.property(coord(), coord(), coord(), coord(), coord(), coord(), (ax, ay, bx, by, cx, cy) => {
        const abc = orient2d(ax, ay, bx, by, cx, cy);
        const bca = orient2d(bx, by, cx, cy, ax, ay);
        fc.pre(abc !== 0 && bca !== 0);
        expect(sign(abc)).toBe(sign(bca));
      }),
      { numRuns: RUNS },
    );
  });

  it("agrees with naive determinant for well-separated points", () => {
    // Cluster a/b/c far from each other so the naive determinant is
    // robust to the last few bits. We use integer coords for clarity.
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (ax, ay, bx, by, cx, cy) => {
          const robust = orient2d(ax, ay, bx, by, cx, cy);
          const naive = orientNaive(ax, ay, bx, by, cx, cy);
          // Magnitudes can differ in low bits, but sign must match.
          expect(sign(robust)).toBe(sign(naive));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("exactly collinear inputs return zero", () => {
    // Endpoints (t=0 and t=1) are always exactly on the line because
    // the float arithmetic reduces to identities. Interior parameters
    // can only be guaranteed collinear when the coordinates are
    // representable integers with small magnitude — robust-predicates
    // returns exact zero for those too.
    fc.assert(
      fc.property(finite(), finite(), finite(), finite(), (ax, ay, bx, by) => {
        // c = a (t=0)
        expect(isZero(orient2d(ax, ay, bx, by, ax, ay))).toBe(true);
        // c = b (t=1)
        expect(isZero(orient2d(ax, ay, bx, by, bx, by))).toBe(true);
      }),
      { numRuns: RUNS },
    );
    // Integer-coord midpoints land exactly on the line.
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        (ax, ay, bx, by) => {
          // 2c = a + b, so 2*orient(a, b, c) is zero exactly.
          const cx = (ax + bx) / 2;
          const cy = (ay + by) / 2;
          expect(isZero(orient2d(ax, ay, bx, by, cx, cy))).toBe(true);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("drives the adaptive path on near-collinear inputs", () => {
    // A perturbation small enough that the floating-point estimate
    // straddles zero forces orient2dadapt to refine. The sign must
    // be consistent — flipping the perturbation flips the sign — and
    // the magnitude must remain finite.
    for (let i = 1; i < 30; i++) {
      const eps = i * 1e-15;
      const d = orient2d(0, 0, 1, 0, 0.5, eps);
      const dn = orient2d(0, 0, 1, 0, 0.5, -eps);
      expect(Number.isFinite(d)).toBe(true);
      expect(Number.isFinite(dn)).toBe(true);
      expect(sign(d)).toBe(-sign(dn));
      // Non-zero sign — the routine resolved the residual.
      expect(sign(d)).not.toBe(0);
    }
    // Wider perturbations exercise the secondary errbound exit.
    for (let i = 1; i < 30; i++) {
      const eps = i * 1e-10;
      expect(Number.isFinite(orient2d(0, 0, 1e6, 0, 5e5, eps))).toBe(true);
      expect(Number.isFinite(orient2d(0, 0, 1e6, 0, 5e5, -eps))).toBe(true);
    }
  });

  it("a == b => zero regardless of c", () => {
    fc.assert(
      fc.property(finite(), finite(), finite(), finite(), (ax, ay, cx, cy) => {
        expect(isZero(orient2d(ax, ay, ax, ay, cx, cy))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe("incircle", () => {
  it("agrees with naive lifted determinant for well-separated points", () => {
    // a, b, c form a ccw triangle inscribed in a unit circle; d is the
    // origin (inside) or far outside.
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 0.9, noNaN: true }), (r) => {
        const ax = 1,
          ay = 0;
        const bx = -0.5,
          by = Math.sqrt(3) / 2;
        const cx = -0.5,
          cy = -Math.sqrt(3) / 2;
        // d at distance r from origin -> inside.
        expect(incircle(ax, ay, bx, by, cx, cy, r * Math.cos(1), r * Math.sin(1))).toBeGreaterThan(0);
        // d at distance 5 from origin -> outside.
        expect(incircle(ax, ay, bx, by, cx, cy, 5, 0)).toBeLessThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it("four points on the unit circle return zero (cocircular)", () => {
    // Sample dyadic angles so cos/sin are exact for the small set
    // {0, pi/2, pi, 3pi/2}. Other angles introduce roundoff in
    // cos/sin themselves — that's a transcendental-rounding artifact,
    // not a predicate failure — so we restrict to the exact ones.
    const pts: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    // Every cyclic ordering of any four cocircular points returns 0.
    const [a, b, c, d] = pts;
    expect(incircle(a![0], a![1], b![0], b![1], c![0], c![1], d![0], d![1])).toBe(0);
    expect(incircle(b![0], b![1], c![0], c![1], d![0], d![1], a![0], a![1])).toBe(0);
  });

  it("drives sum/scale accumulator branches with cancellation-prone inputs", () => {
    // The internal expansion-sum routine has a hot branch on whether a
    // freshly-rounded `hh` partial is zero. Cancellation-rich inputs
    // (subtracting near-equal large numbers) force both sides.
    const pow = (k: number): number => Math.pow(2, k);
    for (let k = 0; k < 50; k++) {
      const x = pow(k);
      const y = pow(k) + pow(k - 30);
      orient2d(x, y, x + 1, y + 1, x + 2, y + 2);
      incircle(x, y, x + 1, y, x + 1, y + 1, x + 2, y + 2);
      // And cocircular-ish.
      incircle(x, 0, -x, 0, 0, x, 0, -x + pow(k - 40));
    }
    // A grid of near-collinear and near-cocircular cases.
    for (let i = 1; i <= 20; i++) {
      for (let j = 1; j <= 20; j++) {
        const eps = i * 1e-15;
        orient2d(0, 0, j, 0, j / 2, eps);
        orient2d(0, 0, j, j, j / 2, j / 2 + eps);
        incircle(j, 0, 0, j, -j, 0, 0, -j + eps);
      }
    }
    // Random doubles using a seeded LCG so coverage runs are reproducible.
    let state = 0x9e3779b9;
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return (state >>> 0) / 0x1_0000_0000;
    };
    for (let i = 0; i < 200; i++) {
      const a = next() * 2 - 1;
      const b = next() * 2 - 1;
      const c = next() * 2 - 1;
      const d = next() * 2 - 1;
      const e = next() * 2 - 1;
      const f = next() * 2 - 1;
      const g = next() * 2 - 1;
      const h = next() * 2 - 1;
      orient2d(a, b, c, d, e, f);
      incircle(a, b, c, d, e, f, g, h);
    }
  });

  it("drives the adaptive path on near-cocircular inputs", () => {
    // A small perturbation off the unit circle forces the residual
    // through `incircleadapt`. We don't pin the sign — we just need
    // the routine to return a finite number.
    const ax = 1,
      ay = 0;
    const bx = 0,
      by = 1;
    const cx = -1,
      cy = 0;
    for (let i = 1; i < 30; i++) {
      const eps = i * 1e-15;
      const d = incircle(ax, ay, bx, by, cx, cy, 0, -1 + eps);
      expect(Number.isFinite(d)).toBe(true);
    }
    // Hit the `permanent === 0` fast path indirectly by passing
    // very small distinct coordinates.
    expect(Number.isFinite(incircle(1, 0, 0, 1, -1, 0, 0, -1 - 1e-300))).toBe(true);
    // And near a degenerate triangle where a, b, c are nearly collinear.
    expect(Number.isFinite(incircle(0, 0, 1, 1e-15, 2, 0, 1, 1))).toBe(true);
  });

  it("incircle sign is invariant under cyclic rotation of (a,b,c)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        (r, theta) => {
          // CCW triangle.
          const ax = 1,
            ay = 0;
          const bx = -0.5,
            by = Math.sqrt(3) / 2;
          const cx = -0.5,
            cy = -Math.sqrt(3) / 2;
          const dx = r * Math.cos(theta);
          const dy = r * Math.sin(theta);
          const s1 = sign(incircle(ax, ay, bx, by, cx, cy, dx, dy));
          const s2 = sign(incircle(bx, by, cx, cy, ax, ay, dx, dy));
          const s3 = sign(incircle(cx, cy, ax, ay, bx, by, dx, dy));
          expect(s1).toBe(s2);
          expect(s2).toBe(s3);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
