import { describe, it, expect } from "vitest";
import { isDashVisible, dashCoverage, SOLID } from "../src/pipelines/dash.js";

describe("dash math", () => {
  it("solid is always visible", () => {
    expect(isDashVisible(0, SOLID)).toBe(true);
    expect(isDashVisible(1e6, SOLID)).toBe(true);
    expect(dashCoverage(0, SOLID, 0.1)).toBe(1);
  });

  it("alternates on/off across a period", () => {
    const p = { dashLen: 4, gapLen: 2 };
    expect(isDashVisible(0, p)).toBe(true);
    expect(isDashVisible(3.9, p)).toBe(true);
    expect(isDashVisible(4.1, p)).toBe(false);
    expect(isDashVisible(5.9, p)).toBe(false);
    // wraps cleanly
    expect(isDashVisible(6.1, p)).toBe(true);
  });

  it("coverage is centered at 0.5 on a dash→gap edge", () => {
    const p = { dashLen: 4, gapLen: 2 };
    const c = dashCoverage(4, p, 1);
    expect(c).toBeCloseTo(0.5, 5);
  });
});
