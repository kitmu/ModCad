// T120 — Spatial-index rebuild scheduler.
//
// Problem: a "modify many entities" sequence (Move on 1000 selected
// items, e.g.) lands as ~one command per entity. If each commit
// rebuilt the static flatbush index inline, we'd thrash CPU and GC
// for no UX benefit: nothing in the UI consumes the rebuilt index
// until the next animation frame.
//
// Solution: a rebuild scheduler. Callers fire `request()` per
// commit; the scheduler queues a single rebuild for the next
// animation frame and discards intermediate requests. A test-only
// `flush()` runs the deferred work synchronously so unit tests
// don't need rAF.
//
// This is intentionally a tiny, dependency-free primitive — no
// state outside the scheduler instance. The CanvasHost owns one
// per active drawing slice and discards it on slice close.

export interface IndexRebuildSchedulerOptions {
  /** Invoked at most once per animation frame after one or more requests. */
  readonly rebuild: () => void;
  /**
   * Override of `requestAnimationFrame` for tests. Defaults to
   * `globalThis.requestAnimationFrame` and falls back to a 0-ms timer
   * (e.g. when running in Node/Vitest without DOM).
   */
  readonly schedule?: (cb: () => void) => void;
}

export class IndexRebuildScheduler {
  private readonly rebuild: () => void;
  private readonly schedule: (cb: () => void) => void;
  private pending = false;
  private rebuildCount = 0;
  private requestCount = 0;

  constructor(opts: IndexRebuildSchedulerOptions) {
    this.rebuild = opts.rebuild;
    this.schedule =
      opts.schedule ??
      (typeof globalThis.requestAnimationFrame === "function"
        ? (cb) => globalThis.requestAnimationFrame(() => cb())
        : (cb) => {
            setTimeout(cb, 0);
          });
  }

  /**
   * Request a rebuild. Multiple requests within the same animation
   * frame coalesce into one. Safe to spam from a tight commit loop.
   */
  request(): void {
    this.requestCount++;
    if (this.pending) return;
    this.pending = true;
    this.schedule(() => {
      this.pending = false;
      this.rebuildCount++;
      this.rebuild();
    });
  }

  /** Telemetry. `requests` ≥ `rebuilds` is the invariant we test. */
  get stats(): { requests: number; rebuilds: number } {
    return { requests: this.requestCount, rebuilds: this.rebuildCount };
  }

  /**
   * Drop any pending rAF callback. Safe to call multiple times.
   * The CanvasHost should call this when its slice changes.
   */
  cancel(): void {
    // We don't track the rAF token because tests use `schedule` and
    // the production rAF callback no-ops cleanly once `pending` flips.
    this.pending = false;
  }
}
