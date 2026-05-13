// T110 — cross-window single-writer (FR-032).
//
// Two layers:
//   1. Acquire/release a per-file writer lock. Web Locks is the
//      primary mechanism (`navigator.locks.request` with
//      `ifAvailable: true`). When unavailable (Safari < 17.4) we fall
//      back to a BroadcastChannel handshake: prospective writers send
//      a "claim" and wait briefly for any current holder to respond
//      with "owned"; absence of a response wins the lock.
//   2. Coordinate takeover. The would-be writer (readonly tab) sends
//      a "takeover-request" message on the per-file BroadcastChannel;
//      the holder either replies "flush" (commit pending edits first)
//      or "discard". A configurable timeout returns "timeout" so the
//      UI can offer force-transfer.
//
// In-tab tab-strip slots are coordinated by the in-process command
// bus — they never go through this module (see plan.md).

const WEB_LOCK_PREFIX = "modcad:writer:";
const BC_PREFIX = "modcad:lock:";
const FALLBACK_CLAIM_TIMEOUT_MS = 150;
const TAKEOVER_TIMEOUT_DEFAULT = 3_000;

/* ────────────── public surface ────────────── */

export interface WriterLock {
  release(): Promise<void>;
  readonly held: boolean;
}

export interface AcquireOpts {
  holdTimeoutMs?: number;
}

export interface TakeoverApi {
  requestTakeover(fileKey: string): Promise<"granted" | "timeout" | "rejected">;
  onTakeoverRequest(
    cb: (fileKey: string) => Promise<"flush" | "discard">,
  ): () => void;
}

/* ────────────── feature detection ────────────── */

interface LocksApi {
  request: (
    name: string,
    opts: { mode?: "exclusive" | "shared"; ifAvailable?: boolean },
    cb: (lock: unknown | null) => Promise<void> | void,
  ) => Promise<void>;
}

function getLocks(): LocksApi | null {
  if (typeof navigator === "undefined") return null;
  const l = (navigator as unknown as { locks?: LocksApi }).locks;
  return l && typeof l.request === "function" ? l : null;
}

function hasBroadcastChannel(): boolean {
  return typeof BroadcastChannel !== "undefined";
}

/* ────────────── BroadcastChannel fallback registry ────────────── */
//
// The fallback needs to coordinate ownership across same-origin tabs
// without Web Locks. We hold one channel per fileKey; the holder
// listens for "claim" and replies "owned"; prospective writers wait
// FALLBACK_CLAIM_TIMEOUT_MS and seize ownership if no reply.

interface FallbackHolder {
  channel: BroadcastChannel;
  fileKey: string;
  released: boolean;
}

const fallbackHolders = new Map<string, FallbackHolder>();

function fallbackChannelName(fileKey: string): string {
  return `${BC_PREFIX}${fileKey}`;
}

interface FallbackMessage {
  kind: "claim" | "owned" | "released" | "takeover-request" | "takeover-flush" | "takeover-discard";
  fileKey: string;
  /** Per-message correlation id so request/reply can pair up. */
  rid?: string;
}

function postMsg(ch: BroadcastChannel, msg: FallbackMessage): void {
  ch.postMessage(msg);
}

function randomRid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `r-${Math.random().toString(36).slice(2)}`;
}

async function tryAcquireFallback(fileKey: string): Promise<WriterLock | "readonly"> {
  if (!hasBroadcastChannel()) {
    // No coordination primitive available — degrade to "you own it"
    // since we cannot detect another writer. This matches the spec's
    // intent: lock is best-effort across UAs that lack both APIs.
    return makeFallbackHolder(fileKey);
  }
  const probe = new BroadcastChannel(fallbackChannelName(fileKey));
  const rid = randomRid();
  let ownedHeard = false;
  const onMsg = (e: MessageEvent<FallbackMessage>) => {
    if (e.data?.kind === "owned" && e.data.fileKey === fileKey) ownedHeard = true;
  };
  probe.addEventListener("message", onMsg);
  postMsg(probe, { kind: "claim", fileKey, rid });
  await new Promise<void>((r) => setTimeout(r, FALLBACK_CLAIM_TIMEOUT_MS));
  probe.removeEventListener("message", onMsg);
  probe.close();
  if (ownedHeard) return "readonly";
  return makeFallbackHolder(fileKey);
}

function makeFallbackHolder(fileKey: string): WriterLock {
  const channel = hasBroadcastChannel()
    ? new BroadcastChannel(fallbackChannelName(fileKey))
    : null;
  const holder: FallbackHolder = {
    channel: channel as BroadcastChannel,
    fileKey,
    released: false,
  };
  if (channel) {
    channel.addEventListener("message", (e: MessageEvent<FallbackMessage>) => {
      if (holder.released) return;
      const m = e.data;
      if (!m || m.fileKey !== fileKey) return;
      if (m.kind === "claim") {
        postMsg(channel, { kind: "owned", fileKey });
      }
    });
    fallbackHolders.set(fileKey, holder);
  }
  return {
    get held() {
      return !holder.released;
    },
    async release() {
      if (holder.released) return;
      holder.released = true;
      if (channel) {
        postMsg(channel, { kind: "released", fileKey });
        channel.close();
      }
      fallbackHolders.delete(fileKey);
    },
  };
}

/* ────────────── Web Locks path ────────────── */

async function tryAcquireWebLocks(
  api: LocksApi,
  fileKey: string,
): Promise<WriterLock | "readonly"> {
  const name = WEB_LOCK_PREFIX + fileKey;
  let resolveOuter!: (v: WriterLock | "readonly") => void;
  let released = false;

  const outer = new Promise<WriterLock | "readonly">((res) => {
    resolveOuter = res;
  });

  // The Web Locks `request` callback holds the lock for the lifetime
  // of its returned promise. We resolve outer with a release-capable
  // handle, then keep that inner promise pending until release() is
  // called.
  void api.request(name, { mode: "exclusive", ifAvailable: true }, (lock) => {
    if (lock === null) {
      resolveOuter("readonly");
      return undefined;
    }
    return new Promise<void>((res) => {
      // Also expose ourselves over the BC channel so takeover requests
      // can find us. The channel is the same transport used by the
      // pure-fallback path.
      const ch = hasBroadcastChannel()
        ? new BroadcastChannel(fallbackChannelName(fileKey))
        : null;
      if (ch) {
        const holder: FallbackHolder = { channel: ch, fileKey, released: false };
        fallbackHolders.set(fileKey, holder);
        ch.addEventListener("message", (e: MessageEvent<FallbackMessage>) => {
          if (holder.released) return;
          const m = e.data;
          if (!m || m.fileKey !== fileKey) return;
          if (m.kind === "claim") postMsg(ch, { kind: "owned", fileKey });
        });
      }
      const handle: WriterLock = {
        get held() {
          return !released;
        },
        async release() {
          if (released) return;
          released = true;
          const h = fallbackHolders.get(fileKey);
          if (h && !h.released && ch) {
            h.released = true;
            postMsg(ch, { kind: "released", fileKey });
            ch.close();
            fallbackHolders.delete(fileKey);
          }
          res();
        },
      };
      resolveOuter(handle);
    });
  });

  return outer;
}

/* ────────────── exported entry points ────────────── */

export async function acquireWriterLock(
  fileKey: string,
  _opts?: AcquireOpts,
): Promise<WriterLock | "readonly"> {
  const locks = getLocks();
  if (locks) return tryAcquireWebLocks(locks, fileKey);
  return tryAcquireFallback(fileKey);
}

/* ────────────── takeover ────────────── */

export const takeover: TakeoverApi = {
  async requestTakeover(fileKey) {
    const timeoutMs = TAKEOVER_TIMEOUT_DEFAULT;
    if (!hasBroadcastChannel()) return "timeout";
    const ch = new BroadcastChannel(fallbackChannelName(fileKey));
    const rid = randomRid();
    return new Promise<"granted" | "timeout" | "rejected">((resolve) => {
      let settled = false;
      const settle = (v: "granted" | "timeout" | "rejected") => {
        if (settled) return;
        settled = true;
        ch.removeEventListener("message", onMsg);
        ch.close();
        resolve(v);
      };
      const onMsg = (e: MessageEvent<FallbackMessage>) => {
        const m = e.data;
        if (!m || m.fileKey !== fileKey || m.rid !== rid) return;
        if (m.kind === "takeover-flush" || m.kind === "takeover-discard") {
          // Holder agreed — wait for the released event (or assume the
          // current holder already let go). A 2s grace handles either.
          const t = setTimeout(() => settle("granted"), 200);
          const onRel = (ev: MessageEvent<FallbackMessage>) => {
            if (ev.data?.kind === "released" && ev.data.fileKey === fileKey) {
              clearTimeout(t);
              ch.removeEventListener("message", onRel);
              settle("granted");
            }
          };
          ch.addEventListener("message", onRel);
        }
      };
      ch.addEventListener("message", onMsg);
      postMsg(ch, { kind: "takeover-request", fileKey, rid });
      setTimeout(() => settle("timeout"), timeoutMs);
    });
  },
  onTakeoverRequest(cb) {
    if (!hasBroadcastChannel()) return () => {};
    // We hook every fallbackHolder channel that exists at registration
    // time and every one that's created afterwards. Tracking is by
    // fileKey -> abort handler.
    const wired = new Set<string>();
    const wire = (h: FallbackHolder) => {
      if (wired.has(h.fileKey)) return;
      wired.add(h.fileKey);
      h.channel.addEventListener(
        "message",
        async (e: MessageEvent<FallbackMessage>) => {
          const m = e.data;
          if (!m || m.kind !== "takeover-request" || m.fileKey !== h.fileKey) return;
          const choice = await cb(h.fileKey);
          const reply: FallbackMessage = {
            kind: choice === "flush" ? "takeover-flush" : "takeover-discard",
            fileKey: h.fileKey,
          };
          if (m.rid !== undefined) reply.rid = m.rid;
          postMsg(h.channel, reply);
        },
      );
    };
    for (const h of fallbackHolders.values()) wire(h);
    // Poll for new holders — locks acquired *after* this call should
    // also surface takeover requests. A 250ms tick is cheap and only
    // runs in tabs that registered.
    const interval = setInterval(() => {
      for (const h of fallbackHolders.values()) wire(h);
    }, 250);
    return () => clearInterval(interval);
  },
};

/* ────────────── test hooks ────────────── */

/** Test-only: drop every tracked holder + close its channel. */
export function __resetLocksForTests(): void {
  for (const h of fallbackHolders.values()) {
    h.released = true;
    try {
      h.channel.close();
    } catch {
      // ignore — channel may already be closed in tests
    }
  }
  fallbackHolders.clear();
}
