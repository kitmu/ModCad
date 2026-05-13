// T057 — coord parser tests. Covers absolute, relative, polar; degrees
// vs radians; whitespace; negative numbers; malformed input.
import { describe, it, expect } from "vitest";
import { parseCoord } from "../../src/commands/parseCoord.js";
import type { ParseContext } from "../../src/commands/parseCoord.js";

const deg: ParseContext = { lastPoint: [1, 2], angleUnit: "deg" };
const noLast: ParseContext = { lastPoint: null, angleUnit: "deg" };

function ok(r: ReturnType<typeof parseCoord>): [number, number] {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return [r.point[0], r.point[1]];
}

describe("parseCoord — absolute", () => {
  it("parses positive integers", () => {
    expect(ok(parseCoord("3,4", deg))).toEqual([3, 4]);
  });

  it("parses negatives and decimals", () => {
    expect(ok(parseCoord("-1.5,2.25", deg))).toEqual([-1.5, 2.25]);
  });

  it("tolerates whitespace around tokens", () => {
    expect(ok(parseCoord("  10 , -5  ", deg))).toEqual([10, -5]);
  });

  it("parses scientific notation", () => {
    expect(ok(parseCoord("1e3,2.5e-1", deg))).toEqual([1000, 0.25]);
  });
});

describe("parseCoord — relative (@dx,dy)", () => {
  it("offsets from lastPoint", () => {
    expect(ok(parseCoord("@2,3", deg))).toEqual([3, 5]);
  });

  it("negative offsets", () => {
    expect(ok(parseCoord("@-1,-2", deg))).toEqual([0, 0]);
  });

  it("errors when no lastPoint", () => {
    const r = parseCoord("@1,1", noLast);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/previous point/);
  });
});

describe("parseCoord — polar (@dist<angle)", () => {
  it("degrees: distance 1 at 0° is +x", () => {
    const ctx: ParseContext = { lastPoint: [0, 0], angleUnit: "deg" };
    const [x, y] = ok(parseCoord("@1<0", ctx));
    expect(x).toBeCloseTo(1, 12);
    expect(y).toBeCloseTo(0, 12);
  });

  it("degrees: distance 1 at 90° is +y", () => {
    const ctx: ParseContext = { lastPoint: [0, 0], angleUnit: "deg" };
    const [x, y] = ok(parseCoord("@1<90", ctx));
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(1, 12);
  });

  it("radians honored when ctx.angleUnit='rad'", () => {
    const ctx: ParseContext = { lastPoint: [0, 0], angleUnit: "rad" };
    const [x, y] = ok(parseCoord(`@1<${Math.PI / 2}`, ctx));
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(1, 12);
  });

  it("negative distance flips direction", () => {
    const ctx: ParseContext = { lastPoint: [0, 0], angleUnit: "deg" };
    const [x, y] = ok(parseCoord("@-2<0", ctx));
    expect(x).toBeCloseTo(-2, 12);
    expect(y).toBeCloseTo(0, 12);
  });

  it("requires a lastPoint", () => {
    const r = parseCoord("@1<45", noLast);
    expect(r.ok).toBe(false);
  });

  it("tolerates whitespace inside polar form", () => {
    const ctx: ParseContext = { lastPoint: [0, 0], angleUnit: "deg" };
    const [x, y] = ok(parseCoord(" @ 1 < 90 ", ctx));
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(1, 12);
  });
});

describe("parseCoord — errors", () => {
  it("rejects empty input", () => {
    const r = parseCoord("", deg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/);
  });

  it("rejects bare '@'", () => {
    const r = parseCoord("@", deg);
    expect(r.ok).toBe(false);
  });

  it("rejects single-number absolute", () => {
    const r = parseCoord("5", deg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/x,y/);
  });

  it("rejects garbage tokens", () => {
    const r = parseCoord("3,foo", deg);
    expect(r.ok).toBe(false);
  });

  it("rejects hex literals", () => {
    const r = parseCoord("0x10,0", deg);
    expect(r.ok).toBe(false);
  });

  it("rejects Infinity", () => {
    const r = parseCoord("Infinity,0", deg);
    expect(r.ok).toBe(false);
  });

  it("rejects NaN", () => {
    const r = parseCoord("NaN,0", deg);
    expect(r.ok).toBe(false);
  });

  it("rejects three-component absolute", () => {
    const r = parseCoord("1,2,3", deg);
    expect(r.ok).toBe(false);
  });

  it("rejects polar with missing angle", () => {
    const ctx: ParseContext = { lastPoint: [0, 0], angleUnit: "deg" };
    const r = parseCoord("@1<", ctx);
    expect(r.ok).toBe(false);
  });
});
