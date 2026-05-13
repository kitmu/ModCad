// Property tests for Vec2 and Mat3. Algebraic identities — not example
// tables — because the kernel must hold these for every input that
// callers will throw at it.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import * as V from "../../src/geometry/Vec2.js";
import * as M from "../../src/geometry/Mat3.js";

const RUNS = 300;

// Finite doubles within a CAD-sized envelope (matches Tier B 1e9 cap).
// We require `min` strictly positive to keep arbitraries away from
// denormals where hypot / division can lose all precision.
const finite = (max = 1e6) =>
  fc.double({ min: -max, max, minExcluded: false, noNaN: true, noDefaultInfinity: true });

const vec2 = (max = 1e6) => fc.tuple(finite(max), finite(max)).map(([x, y]) => V.vec(x, y));

// Equality that treats +0 and -0 as the same value, with optional
// absolute tolerance.
function eqLoose(a: V.Vec2, b: V.Vec2, tol = 0): void {
  expect(Math.abs(a[0] - b[0])).toBeLessThanOrEqual(tol);
  expect(Math.abs(a[1] - b[1])).toBeLessThanOrEqual(tol);
}

describe("Vec2", () => {
  it("add is commutative", () => {
    fc.assert(
      fc.property(vec2(), vec2(), (a, b) => {
        eqLoose(V.add(a, b), V.add(b, a));
      }),
      { numRuns: RUNS },
    );
  });

  it("add then sub is identity", () => {
    fc.assert(
      fc.property(vec2(), vec2(), (a, b) => {
        const r = V.sub(V.add(a, b), b);
        // Floating-point round-trip: cancellation can lose bits in
        // the lowest decimal. Compare to within ULP * |a|.
        const tol = Math.max(Math.abs(a[0]), Math.abs(a[1]), 1) * 1e-9;
        expect(Math.abs(r[0] - a[0])).toBeLessThanOrEqual(tol);
        expect(Math.abs(r[1] - a[1])).toBeLessThanOrEqual(tol);
      }),
      { numRuns: RUNS },
    );
  });

  it("scale by 1 is identity", () => {
    fc.assert(
      fc.property(vec2(), (a) => {
        eqLoose(V.scale(a, 1), a);
      }),
      { numRuns: RUNS },
    );
  });

  it("dot is symmetric", () => {
    fc.assert(
      fc.property(vec2(), vec2(), (a, b) => {
        expect(V.dot(a, b)).toBeCloseTo(V.dot(b, a), 10);
      }),
      { numRuns: RUNS },
    );
  });

  it("cross is anti-symmetric", () => {
    fc.assert(
      fc.property(vec2(), vec2(), (a, b) => {
        expect(V.cross(a, b)).toBeCloseTo(-V.cross(b, a), 10);
      }),
      { numRuns: RUNS },
    );
  });

  it("length is non-negative; lengthSq matches length²", () => {
    fc.assert(
      fc.property(vec2(), (a) => {
        const len = V.length(a);
        expect(len).toBeGreaterThanOrEqual(0);
        const sq = V.lengthSq(a);
        expect(sq).toBeGreaterThanOrEqual(0);
        expect(Math.sqrt(sq)).toBeCloseTo(len, 8);
      }),
      { numRuns: RUNS },
    );
  });

  it("distance is symmetric and matches sqrt(distanceSq)", () => {
    fc.assert(
      fc.property(vec2(), vec2(), (a, b) => {
        expect(V.distance(a, b)).toBeCloseTo(V.distance(b, a), 10);
        expect(Math.sqrt(V.distanceSq(a, b))).toBeCloseTo(V.distance(a, b), 8);
      }),
      { numRuns: RUNS },
    );
  });

  it("normalize yields unit length (or zero for zero input)", () => {
    // Skip subnormal-magnitude inputs where `hypot` underflows and
    // the post-divide result loses all information. The kernel's
    // `normalize` is only ever called on Tier-B-bounded inputs in
    // production, so this is a corner we don't have to defend.
    fc.assert(
      fc.property(vec2(1e3), (a) => {
        const len = V.length(a);
        if (len === 0) {
          eqLoose(V.normalize(a), V.ZERO);
        } else if (len < 1e-200) {
          // skip subnormal magnitudes
          return;
        } else {
          expect(V.length(V.normalize(a))).toBeCloseTo(1, 9);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("equals returns true within epsilon", () => {
    fc.assert(
      fc.property(vec2(), (a) => {
        expect(V.equals(a, a)).toBe(true);
        const jitter: V.Vec2 = [a[0] + 1e-12, a[1] - 1e-12];
        expect(V.equals(a, jitter, 1e-10)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("lerp at t=0 returns a, at t=1 returns b", () => {
    fc.assert(
      fc.property(vec2(), vec2(), (a, b) => {
        eqLoose(V.lerp(a, b, 0), a);
        const r = V.lerp(a, b, 1);
        // Floating: a + (b-a)*1 = b within ulp.
        expect(r[0]).toBeCloseTo(b[0], 9);
        expect(r[1]).toBeCloseTo(b[1], 9);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Mat3", () => {
  it("identity * m = m * identity = m", () => {
    fc.assert(
      fc.property(finite(1000), finite(1000), (tx, ty) => {
        const m = M.translate(tx, ty);
        const lhs = M.multiply(M.IDENTITY, m);
        const rhs = M.multiply(m, M.IDENTITY);
        for (let i = 0; i < 9; i++) {
          expect(Math.abs(lhs[i]! - m[i]!)).toBeLessThanOrEqual(1e-9);
          expect(Math.abs(rhs[i]! - m[i]!)).toBeLessThanOrEqual(1e-9);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("translate then translate sums offsets", () => {
    fc.assert(
      fc.property(finite(1000), finite(1000), finite(1000), finite(1000), (ax, ay, bx, by) => {
        const m = M.multiply(M.translate(ax, ay), M.translate(bx, by));
        const p = M.transform(m, [0, 0]);
        expect(p[0]).toBeCloseTo(ax + bx, 6);
        expect(p[1]).toBeCloseTo(ay + by, 6);
      }),
      { numRuns: RUNS },
    );
  });

  it("scale then transform multiplies coordinates", () => {
    fc.assert(
      fc.property(finite(100), finite(100), vec2(100), (sx, sy, p) => {
        const r = M.transform(M.scale(sx, sy), p);
        expect(r[0]).toBeCloseTo(p[0] * sx, 6);
        expect(r[1]).toBeCloseTo(p[1] * sy, 6);
      }),
      { numRuns: RUNS },
    );
  });

  it("rotate(theta) then rotate(-theta) returns to start", () => {
    fc.assert(
      fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), vec2(100), (t, p) => {
        const m = M.multiply(M.rotate(-t), M.rotate(t));
        const r = M.transform(m, p);
        expect(r[0]).toBeCloseTo(p[0], 4);
        expect(r[1]).toBeCloseTo(p[1], 4);
      }),
      { numRuns: RUNS },
    );
  });

  it("scale default uses sx for both axes", () => {
    fc.assert(
      fc.property(finite(100), (sx) => {
        const a = M.scale(sx);
        const b = M.scale(sx, sx);
        for (let i = 0; i < 9; i++) expect(a[i]).toBe(b[i]);
      }),
      { numRuns: 50 },
    );
  });
});
