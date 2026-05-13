// FrameStats accumulator. Tracks rolling FPS, draw-call count, and the
// last frame time so the renderer can answer `getStats()` cheaply.
// Optional overlay drawing is intentionally trivial — the heavy lifting
// stays in the scene-graph API and we just push a synthetic entity
// stream through the same upsert path when the host enables it.
import type { FrameStats } from "../api.js";

export class FrameStatsTracker {
  private samples: number[] = [];
  private readonly maxSamples = 60;
  private lastTimestamp = 0;
  private drawCalls = 0;
  private entityCount = 0;
  private lastFrameMs = 0;

  begin(now: number): void {
    this.lastTimestamp = now;
    this.drawCalls = 0;
  }

  /** Record a draw-call this frame. */
  recordDraw(): void {
    this.drawCalls += 1;
  }

  setEntityCount(n: number): void {
    this.entityCount = n;
  }

  end(now: number): void {
    const dt = Math.max(0, now - this.lastTimestamp);
    this.lastFrameMs = dt;
    this.samples.push(dt);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  get(): FrameStats {
    const avg =
      this.samples.length > 0
        ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length
        : 0;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      drawCalls: this.drawCalls,
      entityCount: this.entityCount,
      frameTimeMs: this.lastFrameMs,
    };
  }

  reset(): void {
    this.samples = [];
    this.lastFrameMs = 0;
    this.drawCalls = 0;
  }
}
