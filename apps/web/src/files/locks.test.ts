// T110 — unit tests for the BroadcastChannel takeover handshake.
//
// We don't have a usable `navigator.locks` shim in jsdom; instead we
// stub it as undefined so the fallback path runs. The fallback uses
// the real BroadcastChannel implementation that jsdom 25 provides.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { acquireWriterLock, takeover, __resetLocksForTests } from "./locks.js";

// jsdom's BroadcastChannel is real across same-process channels.
// Ensure navigator.locks is absent so the fallback path is exercised.
beforeAll(() => {
  if (typeof globalThis.navigator !== "undefined") {
    delete (globalThis.navigator as { locks?: unknown }).locks;
  }
});

afterEach(() => {
  __resetLocksForTests();
});

describe("BC fallback writer lock", () => {
  it("second acquire of the same fileKey gets readonly", async () => {
    const first = await acquireWriterLock("file-a");
    expect(first).not.toBe("readonly");

    // Give the holder a tick to install its listener.
    await new Promise((r) => setTimeout(r, 20));

    const second = await acquireWriterLock("file-a");
    expect(second).toBe("readonly");

    if (first !== "readonly") await first.release();
  });

  it("after release a new acquire succeeds", async () => {
    const first = await acquireWriterLock("file-b");
    expect(first).not.toBe("readonly");
    if (first === "readonly") return;
    await first.release();

    await new Promise((r) => setTimeout(r, 20));

    const second = await acquireWriterLock("file-b");
    expect(second).not.toBe("readonly");
    if (second !== "readonly") await second.release();
  });

  it("takeover request reaches the holder callback", async () => {
    const first = await acquireWriterLock("file-c");
    expect(first).not.toBe("readonly");
    if (first === "readonly") return;

    const cb = vi.fn(async () => "flush" as const);
    const off = takeover.onTakeoverRequest(cb);

    // Allow the polling interval to wire the holder.
    await new Promise((r) => setTimeout(r, 300));

    // Kick off a takeover request from a *separate* requester (the BC
    // channel is per-call so this simulates a second tab).
    const requestPromise = takeover.requestTakeover("file-c");

    // After a short delay, release the writer so the requester resolves.
    setTimeout(() => {
      void first.release();
    }, 100);

    const outcome = await requestPromise;
    off();
    expect(outcome).toBe("granted");
    expect(cb).toHaveBeenCalled();
  }, 5_000);

  it("takeover times out when no holder is listening", async () => {
    const outcome = await takeover.requestTakeover("file-d");
    expect(outcome).toBe("timeout");
  }, 10_000);
});
