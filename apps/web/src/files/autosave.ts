// T108 — Autosave service (FR-031).
//
// Subscribes to DrawingSessionStore. Whenever any slice transitions to
// `dirty === true`, schedules a 30s debounced flush. On flush, writes
// `autosave/<lockKey>/<iso>.modcad` to OPFS (or the IDB fallback),
// keeping at most 10 snapshots per lockKey. A manual save (via
// FileMenu's saveActiveDrawing) records `last-saved/<lockKey>` in IDB
// and does NOT consume an autosave slot.
//
// lockKey policy:
//   - For a slice loaded from disk: the file name (slice.name).
//   - For an unsaved slice: a stable session-uuid stored on the slice
//     via setAutosaveSessionId(sliceId). This is also reused as the
//     Web Locks key once the slice is saved (file name takes over).
//
// Storage shape (OPFS):
//   autosave/<lockKey>/<iso>.modcad   (gzipped .modcad bytes)
//   The directory listing IS the snapshot list, newest by ISO sort.
//
// Storage shape (IDB fallback, in the existing `modcad-prefs` kv store):
//   autosave-snapshots/<lockKey>      → string[] of ISO timestamps
//   autosave-blob/<lockKey>/<iso>     → Uint8Array
//
// We never touch the network. The OPFS path uses navigator.storage
// which is local-only.
import type { Drawing } from "@modcad/core";
import { writeModcad, readModcad } from "@modcad/codecs";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { idbGet, idbSet } from "../storage/idb.js";
import { useAutosaveState } from "../state/autosaveState.js";

const RETENTION = 10;
const DEBOUNCE_MS = 30_000;

/**
 * Public snapshot shape required by the AutosaveService contract.
 * `bytes` is loaded on demand; readers should call `restore(handleKey,
 * iso)` if they need them.
 */
export interface AutosaveSnapshot {
  handleKey: string;
  isoTimestamp: string;
  bytes: Uint8Array;
  bytesGzipped: boolean;
}

/* ────────────── OPFS detection / typed surface ────────────── */

interface OpfsDirectory {
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<OpfsDirectory>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<OpfsFile>;
  removeEntry: (name: string, opts?: { recursive?: boolean }) => Promise<void>;
  values: () => AsyncIterable<OpfsDirectory | OpfsFile>;
  readonly name: string;
  readonly kind: "directory" | "file";
}

interface OpfsFile {
  getFile: () => Promise<File>;
  createWritable: () => Promise<OpfsWritable>;
  readonly name: string;
  readonly kind: "file";
}

interface OpfsWritable {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}

interface StorageManagerWithDirectory {
  getDirectory?: () => Promise<OpfsDirectory>;
}

async function getOpfsRoot(): Promise<OpfsDirectory | null> {
  if (typeof navigator === "undefined") return null;
  const sm = navigator.storage as unknown as StorageManagerWithDirectory | undefined;
  if (!sm || typeof sm.getDirectory !== "function") return null;
  try {
    return await sm.getDirectory();
  } catch {
    return null;
  }
}

/* ────────────── lockKey allocation per slice ────────────── */

const sessionLockKeys = new Map<string, string>();

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Resolve a stable lockKey for a slice. Reuses `slice.name` once it
 *  ends with `.modcad`; otherwise allocates a per-slice uuid that
 *  persists for the lifetime of the slice. */
export function lockKeyFor(sliceId: string, sliceName: string): string {
  if (sliceName.endsWith(".modcad")) return sliceName;
  let key = sessionLockKeys.get(sliceId);
  if (!key) {
    key = `untitled-${uuid()}`;
    sessionLockKeys.set(sliceId, key);
  }
  return key;
}

function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

/* ────────────── OPFS read/write primitives ────────────── */

async function opfsListSnapshots(
  root: OpfsDirectory,
  lockKey: string,
): Promise<string[]> {
  try {
    const auto = await root.getDirectoryHandle("autosave", { create: true });
    const dir = await auto.getDirectoryHandle(safeSegment(lockKey), { create: true });
    const isos: string[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === "file" && entry.name.endsWith(".modcad")) {
        isos.push(entry.name.replace(/\.modcad$/, ""));
      }
    }
    isos.sort();
    return isos;
  } catch {
    return [];
  }
}

async function opfsWriteSnapshot(
  root: OpfsDirectory,
  lockKey: string,
  iso: string,
  bytes: Uint8Array,
): Promise<void> {
  const auto = await root.getDirectoryHandle("autosave", { create: true });
  const dir = await auto.getDirectoryHandle(safeSegment(lockKey), { create: true });
  const fh = await dir.getFileHandle(`${iso}.modcad`, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes);
  await w.close();
}

async function opfsReadSnapshot(
  root: OpfsDirectory,
  lockKey: string,
  iso: string,
): Promise<Uint8Array | null> {
  try {
    const auto = await root.getDirectoryHandle("autosave", { create: true });
    const dir = await auto.getDirectoryHandle(safeSegment(lockKey), { create: true });
    const fh = await dir.getFileHandle(`${iso}.modcad`);
    const f = await fh.getFile();
    const buf = await f.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function opfsDeleteSnapshot(
  root: OpfsDirectory,
  lockKey: string,
  iso: string,
): Promise<void> {
  try {
    const auto = await root.getDirectoryHandle("autosave", { create: true });
    const dir = await auto.getDirectoryHandle(safeSegment(lockKey), { create: true });
    await dir.removeEntry(`${iso}.modcad`);
  } catch {
    // best effort
  }
}

async function opfsListAllLockKeys(root: OpfsDirectory): Promise<string[]> {
  try {
    const auto = await root.getDirectoryHandle("autosave", { create: true });
    const keys: string[] = [];
    for await (const entry of auto.values()) {
      if (entry.kind === "directory") keys.push(entry.name);
    }
    return keys;
  } catch {
    return [];
  }
}

async function opfsDeleteLockKey(root: OpfsDirectory, lockKey: string): Promise<void> {
  try {
    const auto = await root.getDirectoryHandle("autosave", { create: true });
    await auto.removeEntry(safeSegment(lockKey), { recursive: true });
  } catch {
    // best effort
  }
}

/* ────────────── IDB fallback primitives ────────────── */

const idbListKey = (k: string): string => `autosave-snapshots/${k}`;
const idbBlobKey = (k: string, iso: string): string => `autosave-blob/${k}/${iso}`;
const idbAllKeysKey = "autosave-lockkeys";

async function idbListSnapshots(lockKey: string): Promise<string[]> {
  const v = await idbGet<string[]>(idbListKey(lockKey));
  return v ?? [];
}

async function idbWriteSnapshot(
  lockKey: string,
  iso: string,
  bytes: Uint8Array,
): Promise<void> {
  const list = await idbListSnapshots(lockKey);
  list.push(iso);
  list.sort();
  await idbSet(idbBlobKey(lockKey, iso), bytes);
  await idbSet(idbListKey(lockKey), list);
  const all = (await idbGet<string[]>(idbAllKeysKey)) ?? [];
  if (!all.includes(lockKey)) {
    all.push(lockKey);
    await idbSet(idbAllKeysKey, all);
  }
}

async function idbReadSnapshot(lockKey: string, iso: string): Promise<Uint8Array | null> {
  const v = await idbGet<Uint8Array>(idbBlobKey(lockKey, iso));
  return v ?? null;
}

async function idbDeleteSnapshot(lockKey: string, iso: string): Promise<void> {
  const list = (await idbListSnapshots(lockKey)).filter((x) => x !== iso);
  await idbSet(idbListKey(lockKey), list);
  await idbSet(idbBlobKey(lockKey, iso), undefined);
}

async function idbListAllLockKeys(): Promise<string[]> {
  return (await idbGet<string[]>(idbAllKeysKey)) ?? [];
}

async function idbDeleteLockKey(lockKey: string): Promise<void> {
  const isos = await idbListSnapshots(lockKey);
  for (const iso of isos) await idbSet(idbBlobKey(lockKey, iso), undefined);
  await idbSet(idbListKey(lockKey), []);
  const all = ((await idbGet<string[]>(idbAllKeysKey)) ?? []).filter(
    (x) => x !== lockKey,
  );
  await idbSet(idbAllKeysKey, all);
}

/* ────────────── public API ────────────── */

/** Internal listing entry; the public {@link AutosaveSnapshot} carries bytes. */
export interface AutosaveEntry {
  lockKey: string;
  iso: string;
}

export async function listAutosavesFor(
  lockKey: string,
): Promise<AutosaveEntry[]> {
  const root = await getOpfsRoot();
  const isos = root
    ? await opfsListSnapshots(root, lockKey)
    : await idbListSnapshots(lockKey);
  // newest first
  return [...isos].reverse().map((iso) => ({ lockKey, iso }));
}

export async function listAllAutosaveLockKeys(): Promise<string[]> {
  const root = await getOpfsRoot();
  return root ? opfsListAllLockKeys(root) : idbListAllLockKeys();
}

export async function readAutosaveBytes(
  entry: AutosaveEntry,
): Promise<Uint8Array | null> {
  const root = await getOpfsRoot();
  return root
    ? opfsReadSnapshot(root, entry.lockKey, entry.iso)
    : idbReadSnapshot(entry.lockKey, entry.iso);
}

/** FR-031 restore: push the snapshot's drawing into a new slot. */
export async function restoreAutosave(entry: AutosaveEntry): Promise<boolean> {
  const bytes = await readAutosaveBytes(entry);
  if (!bytes) return false;
  const { drawing } = readModcad(bytes);
  const sess = useDrawingSession.getState();
  const id = sess.openNew(entry.lockKey);
  sess.replaceDrawing(id, drawing, entry.lockKey);
  return true;
}

/** Manual-save bookkeeping. Records the moment of a user-explicit save
 *  for `lockKey` in IDB so the restore-prompt logic can compare ISO
 *  timestamps. Does NOT touch autosave snapshots. */
export async function recordManualSave(lockKey: string): Promise<void> {
  const iso = new Date().toISOString();
  await idbSet(`last-saved/${lockKey}`, iso);
}

export async function getLastManualSave(
  lockKey: string,
): Promise<string | null> {
  return (await idbGet<string>(`last-saved/${lockKey}`)) ?? null;
}

export async function markAutosaveDismissed(lockKey: string): Promise<void> {
  await idbSet(`autosave-dismissed/${lockKey}`, true);
}

export async function isAutosaveDismissed(lockKey: string): Promise<boolean> {
  return Boolean(await idbGet<boolean>(`autosave-dismissed/${lockKey}`));
}

/** Drop autosave entries for a lockKey (e.g. when its slot is closed
 *  cleanly after a save). Keeps the *most recent* snapshot for restore
 *  on next launch per FR-031 wording. */
export async function pruneInflightAutosaves(lockKey: string): Promise<void> {
  const root = await getOpfsRoot();
  const isos = root
    ? await opfsListSnapshots(root, lockKey)
    : await idbListSnapshots(lockKey);
  if (isos.length <= 1) return;
  const toDelete = isos.slice(0, -1);
  for (const iso of toDelete) {
    if (root) await opfsDeleteSnapshot(root, lockKey, iso);
    else await idbDeleteSnapshot(lockKey, iso);
  }
}

/* ────────────── flush + retention ────────────── */

async function flushSlice(sliceId: string, drawing: Drawing, name: string): Promise<void> {
  const lockKey = lockKeyFor(sliceId, name);
  const iso = new Date().toISOString();
  const bytes = writeModcad(drawing);
  const root = await getOpfsRoot();
  if (root) {
    await opfsWriteSnapshot(root, lockKey, iso, bytes);
    const list = await opfsListSnapshots(root, lockKey);
    if (list.length > RETENTION) {
      const drop = list.slice(0, list.length - RETENTION);
      for (const old of drop) await opfsDeleteSnapshot(root, lockKey, old);
    }
  } else {
    await idbWriteSnapshot(lockKey, iso, bytes);
    const list = await idbListSnapshots(lockKey);
    if (list.length > RETENTION) {
      const drop = list.slice(0, list.length - RETENTION);
      for (const old of drop) await idbDeleteSnapshot(lockKey, old);
    }
  }
  // A new autosave invalidates a prior "dismissed" choice.
  await idbSet(`autosave-dismissed/${lockKey}`, false);
  // Surface the timestamp so the UI can render "last autosave: Ns ago".
  useAutosaveState.getState().recordSnapshot(lockKey, iso);
}

/* ────────────── debounced subscription ────────────── */

interface PendingTimer {
  timer: ReturnType<typeof setTimeout>;
  scheduledAt: number;
}

const pending = new Map<string, PendingTimer>();
let unsubscribe: (() => void) | null = null;
let debounceOverride: number | null = null;

/** For tests: override the debounce window. Pass `null` to restore. */
export function setAutosaveDebounceMs(ms: number | null): void {
  debounceOverride = ms;
}

function debounceMs(): number {
  return debounceOverride ?? DEBOUNCE_MS;
}

function schedule(sliceId: string): void {
  const existing = pending.get(sliceId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pending.delete(sliceId);
    const { slices } = useDrawingSession.getState();
    const slice = slices.find((s) => s.id === sliceId);
    if (!slice || !slice.dirty) return;
    void flushSlice(slice.id, slice.drawing, slice.name).catch(() => {});
  }, debounceMs());
  pending.set(sliceId, { timer, scheduledAt: Date.now() });
}

/** Force any pending debounced writes to run immediately. Used at
 *  slot-close, beforeunload, and from the e2e dev API. */
export async function flushNow(): Promise<void> {
  const ids = [...pending.keys()];
  for (const id of ids) {
    const t = pending.get(id);
    if (t) clearTimeout(t.timer);
    pending.delete(id);
  }
  const { slices } = useDrawingSession.getState();
  for (const id of ids) {
    const slice = slices.find((s) => s.id === id);
    if (slice && slice.dirty) {
      await flushSlice(slice.id, slice.drawing, slice.name);
    }
  }
}

/** Subscribe to the drawing-session store. Idempotent — safe to call
 *  multiple times from React strict-mode effects. */
export function startAutosave(): () => void {
  if (unsubscribe) return unsubscribe;
  // Track per-slice dirty state so we only schedule on dirty edges or
  // continued-dirty edits.
  let prev = new Map<string, { dirty: boolean; rev: number }>();
  const seedSlice = useDrawingSession.getState().slices;
  for (const s of seedSlice) prev.set(s.id, { dirty: s.dirty, rev: 0 });

  const off = useDrawingSession.subscribe((state) => {
    const next = new Map<string, { dirty: boolean; rev: number }>();
    for (const s of state.slices) {
      const before = prev.get(s.id);
      // `rev` is a proxy for "edit happened" — we bump it whenever
      // drawing object identity changes, which the store mutates on
      // applyCommand / syncFromBus.
      const rev = before
        ? before.rev + (before.dirty && s.dirty ? 1 : 0)
        : 0;
      next.set(s.id, { dirty: s.dirty, rev });
      if (s.dirty) schedule(s.id);
      else {
        const p = pending.get(s.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(s.id);
        }
      }
    }
    // Cancel timers for removed slices.
    for (const id of prev.keys()) {
      if (!next.has(id)) {
        const t = pending.get(id);
        if (t) clearTimeout(t.timer);
        pending.delete(id);
      }
    }
    prev = next;
  });

  unsubscribe = () => {
    off();
    for (const { timer } of pending.values()) clearTimeout(timer);
    pending.clear();
    unsubscribe = null;
  };
  return unsubscribe;
}

/* ────────────── AutosaveService factory (T108 public contract) ────────────── */

export interface AutosaveService {
  start(): void;
  stop(): void;
  forceSnapshot(): Promise<void>;
  list(handleKey: string): Promise<AutosaveSnapshot[]>;
  restore(handleKey: string, isoTimestamp: string): Promise<Uint8Array | null>;
  purgeOlderThan(handleKey: string, isoTimestamp: string): Promise<number>;
}

export interface CreateAutosaveServiceOpts {
  sessionStore: typeof useDrawingSession;
  intervalMs?: number;
}

/**
 * Build an AutosaveService bound to a session store. The factory wraps
 * the module-level subscription helpers so callers can swap stores in
 * tests; in production only one service is constructed.
 */
export function createAutosaveService(
  opts: CreateAutosaveServiceOpts,
): AutosaveService {
  if (opts.intervalMs !== undefined) {
    setAutosaveDebounceMs(opts.intervalMs);
  }
  let stop: (() => void) | null = null;
  return {
    start() {
      if (stop) return;
      stop = startAutosave();
    },
    stop() {
      stop?.();
      stop = null;
    },
    async forceSnapshot() {
      // First drain any debounced timers, then snapshot any still-dirty
      // slices belonging to the bound store.
      await flushNow();
      const { slices } = opts.sessionStore.getState();
      for (const s of slices) {
        if (s.dirty) await flushSlice(s.id, s.drawing, s.name);
      }
    },
    async list(handleKey) {
      const entries = await listAutosavesFor(handleKey);
      const out: AutosaveSnapshot[] = [];
      for (const e of entries) {
        const bytes = await readAutosaveBytes(e);
        if (!bytes) continue;
        out.push({
          handleKey,
          isoTimestamp: e.iso,
          bytes,
          bytesGzipped: true,
        });
      }
      return out;
    },
    async restore(handleKey, isoTimestamp) {
      return readAutosaveBytes({ lockKey: handleKey, iso: isoTimestamp });
    },
    async purgeOlderThan(handleKey, isoTimestamp) {
      const root = await getOpfsRoot();
      const isos = root
        ? await opfsListSnapshots(root, handleKey)
        : await idbListSnapshots(handleKey);
      const toDrop = isos.filter((iso) => iso < isoTimestamp);
      for (const iso of toDrop) {
        if (root) await opfsDeleteSnapshot(root, handleKey, iso);
        else await idbDeleteSnapshot(handleKey, iso);
      }
      return toDrop.length;
    },
  };
}

/** Test-only: clear all autosave state in OPFS+IDB. */
export async function __resetAutosaveForTests(): Promise<void> {
  const root = await getOpfsRoot();
  if (root) {
    for (const k of await opfsListAllLockKeys(root)) {
      await opfsDeleteLockKey(root, k);
    }
  }
  for (const k of await idbListAllLockKeys()) {
    await idbDeleteLockKey(k);
  }
  await idbSet(idbAllKeysKey, []);
  sessionLockKeys.clear();
}
