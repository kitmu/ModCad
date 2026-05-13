import { describe, it, expect } from "vitest";
import { FrameStatsTracker } from "../src/debug/FrameStats.js";

describe("FrameStatsTracker", () => {
  it("derives fps from rolling samples", () => {
    const t = new FrameStatsTracker();
    let now = 0;
    for (let i = 0; i < 5; i++) {
      t.begin(now);
      t.recordDraw();
      now += 10;
      t.end(now);
    }
    t.setEntityCount(42);
    const s = t.get();
    expect(s.drawCalls).toBe(1);
    expect(s.entityCount).toBe(42);
    expect(s.fps).toBeGreaterThan(0);
    expect(s.frameTimeMs).toBeCloseTo(10, 5);
  });

  it("reset clears samples", () => {
    const t = new FrameStatsTracker();
    t.begin(0);
    t.end(20);
    t.reset();
    expect(t.get().fps).toBe(0);
  });
});
