// T120 — Scheduler test. 10 requests in a single tick collapse into
// exactly 1 rebuild. A subsequent tick that receives new requests
// produces a second rebuild.
import { describe, it, expect, vi } from "vitest";
import { IndexRebuildScheduler } from "./IndexRebuildScheduler.js";

describe("IndexRebuildScheduler", () => {
  it("coalesces 10 requests in the same tick into 1 rebuild", () => {
    const pendingRef: { cb: (() => void) | null } = { cb: null };
    const schedule = vi.fn((cb: () => void) => {
      pendingRef.cb = cb;
    });
    const rebuild = vi.fn();
    const s = new IndexRebuildScheduler({ rebuild, schedule });

    for (let i = 0; i < 10; i++) s.request();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(rebuild).not.toHaveBeenCalled();

    pendingRef.cb?.();
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(s.stats).toEqual({ requests: 10, rebuilds: 1 });
  });

  it("schedules a fresh rebuild after the previous tick fires", () => {
    const pendingRef: { cb: (() => void) | null } = { cb: null };
    const schedule = vi.fn((cb: () => void) => {
      pendingRef.cb = cb;
    });
    const rebuild = vi.fn();
    const s = new IndexRebuildScheduler({ rebuild, schedule });

    s.request();
    pendingRef.cb?.();
    s.request();
    s.request();
    pendingRef.cb?.();

    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(s.stats).toEqual({ requests: 3, rebuilds: 2 });
  });

  it("cancel() prevents the queued rebuild from re-firing", () => {
    const pendingRef: { cb: (() => void) | null } = { cb: null };
    const schedule = vi.fn((cb: () => void) => {
      pendingRef.cb = cb;
    });
    const rebuild = vi.fn();
    const s = new IndexRebuildScheduler({ rebuild, schedule });

    s.request();
    s.cancel();
    // After cancel, a new request schedules a new tick.
    s.request();
    expect(schedule).toHaveBeenCalledTimes(2);
    pendingRef.cb?.();
    expect(rebuild).toHaveBeenCalledTimes(1);
  });
});
