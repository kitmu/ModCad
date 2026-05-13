// Window-mounted introspection hook for Playwright e2e tests.
//
// The US1 specs need to assert on store state (entity counts, dirty flag,
// last-saved bytes) without DOM scraping. The renderer + tool layer is
// pure GPU pixels, so DOM-only assertions would be brittle.
//
// Mounted unconditionally in dev/test builds; production should tree-shake
// it via Vite's `import.meta.env.PROD` guard in main.tsx if/when desired.
import type {
  Drawing,
  Entity,
  EntityPointRef,
  Id,
  Vec2Type,
} from "@modcad/core";
import {
  alignedDimensionCommand,
  listVisibleEntities,
  moveCommand,
  recomputeDimensionGeometry,
} from "@modcad/core";
import { useMeasureState } from "./state/measureState.js";
import { commandRouter } from "./palette/commandRouter.js";
import {
  readModcad,
  writeModcad,
  readDxf,
  writeDxf,
  writeSvg,
  writePdf,
  type DxfReadResult,
  type PaperSize,
} from "@modcad/codecs";
import { surfaceDxfWarnings } from "./notifications/ImportWarnings.js";
import { useDrawingSession } from "./workspace/DrawingSessionStore.js";
import { useCommandState } from "./state/commandState.js";
import { useSnapState } from "./state/snapState.js";
import { useSelection } from "./state/selection.js";
import { useNotifications } from "./state/notifications.js";
import {
  installFsAccessOverrides,
  type FsAccessOverrides,
} from "./files/fsAccess.js";
import { acquireWriterLock, takeover, type WriterLock } from "./files/locks.js";
import { promptTakeover } from "./files/TakeoverDialog.js";
import {
  createAutosaveService,
  listAllAutosaveLockKeys,
} from "./files/autosave.js";

export interface DevApi {
  /** Snapshot of the active drawing (or null if no slice is open). */
  readonly activeDrawing: Drawing | null;
  /** Last bytes written by Save (FR-031 / US1.3). Set by FileMenu's save handler. */
  lastSavedBytes: Uint8Array | null;
  /** Last bytes written by Export (US5). Set by exportActiveDrawing. */
  lastExportBytes: Uint8Array | null;
  /** Format of the last export ("dxf" | "svg" | "pdf"), or null. */
  lastExportFormat: "dxf" | "svg" | "pdf" | null;
  /** True if the active slice has unsaved changes. */
  readonly activeDirty: boolean;
  /** Name of the currently active command tool, or null. */
  readonly activeCommand: string | null;
  /** Currently armed snap point in world coordinates, or null. */
  readonly activeSnap: Vec2Type | null;
  /** Replace the active drawing (used by the reopen-from-bytes test). */
  loadDrawing: (drawing: Drawing) => void;
  /** Decode .modcad bytes and replace the active drawing. */
  loadModcadBytes: (bytes: Uint8Array) => void;
  /** Serialize the active drawing to .modcad bytes (no FS involvement). */
  exportModcadBytes: () => Uint8Array | null;
  /** Install File System Access API stubs for headless Chromium. */
  installFsStub: (overrides: FsAccessOverrides) => void;
  /** Restore the unstubbed FS Access wrappers. */
  uninstallFsStub: () => void;
  /** Entities the active drawing would render (layer-visibility filtered). */
  readonly visibleEntities: Entity[];
  /** Notifications surface (US3 acceptance scenario 4). */
  readonly notifications: ReadonlyArray<{ id: number; message: string }>;
  /** Selection helpers — used by US3 properties-panel test. */
  setSelection: (ids: Id[]) => void;
  /** US5: import a DXF string directly (skips file picker). */
  loadDxfText: (source: string) => DxfReadResult;
  /** US5: serialize active drawing to DXF text. */
  exportDxfText: () => string | null;
  /** US5: serialize active drawing to SVG text. */
  exportSvgText: () => string | null;
  /** US5: serialize active drawing to PDF bytes. */
  exportPdfBytes: (opts?: { paperSize?: PaperSize; orientation?: "portrait" | "landscape" }) => Promise<Uint8Array | null>;
  /** T110 — acquire a writer lock for a fileKey (returns "readonly" if taken). */
  acquireWriterLock: (
    fileKey: string,
  ) => Promise<{ held: boolean; readonly: boolean }>;
  /** T110 — release the lock for fileKey acquired via acquireWriterLock. */
  releaseWriterLock: (fileKey: string) => Promise<void>;
  /** T110 — request takeover for fileKey from another tab. */
  requestTakeover: (fileKey: string) => Promise<"granted" | "timeout" | "rejected">;
  /** T111 — register the holder-side takeover callback through the UI dialog. */
  armTakeover: () => void;
  /** T108 — force an autosave flush. */
  autosaveForceSnapshot: () => Promise<void>;
  /** T108 — list autosave snapshots for a handleKey. */
  autosaveList: (
    handleKey: string,
  ) => Promise<Array<{ handleKey: string; iso: string; len: number }>>;
  /** T108 — list all handleKeys with at least one snapshot. */
  autosaveListKeys: () => Promise<string[]>;
  // US4 dimension/measure surface.
  /** Add an aligned dimension between two entity-point refs. */
  addAlignedDimension: (
    a: EntityPointRef,
    b: EntityPointRef,
    offset: number,
  ) => Id | null;
  /** Translate selected entity ids by (dx, dy). */
  moveEntities: (ids: Id[], delta: Vec2Type) => void;
  /** Resolve a dimension's current value (numeric + formatted). */
  dimensionValue: (id: Id) => { numericValue: number; value: string } | null;
  /** Latest measure-tool readout. */
  readonly measureReadout: { mode: string; value: number; label: string } | null;
  /** Dispatch a command by name through the same router the palette uses. */
  dispatchCommand: (name: string) => boolean;
}

declare global {
  interface Window {
    __modcad?: DevApi;
  }
}

export function installDevApi(): void {
  if (typeof window === "undefined") return;
  const api: DevApi = {
    get activeDrawing() {
      const { slices, activeId } = useDrawingSession.getState();
      return slices.find((s) => s.id === activeId)?.drawing ?? null;
    },
    get activeDirty() {
      const { slices, activeId } = useDrawingSession.getState();
      return slices.find((s) => s.id === activeId)?.dirty ?? false;
    },
    get activeCommand() {
      return useCommandState.getState().active?.name ?? null;
    },
    get activeSnap() {
      return useSnapState.getState().point;
    },
    lastSavedBytes: null,
    lastExportBytes: null,
    lastExportFormat: null,
    loadDrawing: (drawing) => {
      const { activeId, replaceDrawing, openNew } = useDrawingSession.getState();
      const targetId = activeId ?? openNew();
      replaceDrawing(targetId, drawing);
    },
    loadModcadBytes: (bytes) => {
      const { drawing } = readModcad(bytes);
      const { activeId, replaceDrawing, openNew } = useDrawingSession.getState();
      const targetId = activeId ?? openNew();
      replaceDrawing(targetId, drawing);
    },
    exportModcadBytes: () => {
      const { slices, activeId } = useDrawingSession.getState();
      const active = slices.find((s) => s.id === activeId);
      return active ? writeModcad(active.drawing) : null;
    },
    installFsStub: (overrides) => {
      installFsAccessOverrides(overrides);
    },
    uninstallFsStub: () => {
      installFsAccessOverrides(null);
    },
    get visibleEntities() {
      const { slices, activeId } = useDrawingSession.getState();
      const active = slices.find((s) => s.id === activeId);
      return active ? listVisibleEntities(active.drawing) : [];
    },
    get notifications() {
      return useNotifications.getState().list.map((n) => ({
        id: n.id,
        message: n.message,
      }));
    },
    setSelection: (ids) => {
      const { activeId } = useDrawingSession.getState();
      if (!activeId) return;
      useSelection.getState().set(activeId, ids);
    },
    loadDxfText: (source) => {
      const result = readDxf(source);
      const { activeId, replaceDrawing, openNew } = useDrawingSession.getState();
      const targetId = activeId ?? openNew();
      replaceDrawing(targetId, result.drawing);
      surfaceDxfWarnings(result.warnings);
      return result;
    },
    exportDxfText: () => {
      const { slices, activeId } = useDrawingSession.getState();
      const active = slices.find((s) => s.id === activeId);
      return active ? writeDxf(active.drawing) : null;
    },
    exportSvgText: () => {
      const { slices, activeId } = useDrawingSession.getState();
      const active = slices.find((s) => s.id === activeId);
      return active ? writeSvg(active.drawing) : null;
    },
    exportPdfBytes: async (opts) => {
      const { slices, activeId } = useDrawingSession.getState();
      const active = slices.find((s) => s.id === activeId);
      if (!active) return null;
      return writePdf(active.drawing, opts ?? {});
    },
    acquireWriterLock: async (fileKey) => {
      const r = await acquireWriterLock(fileKey);
      if (r === "readonly") return { held: false, readonly: true };
      heldLocks.set(fileKey, r);
      return { held: r.held, readonly: false };
    },
    releaseWriterLock: async (fileKey) => {
      const h = heldLocks.get(fileKey);
      if (h) {
        await h.release();
        heldLocks.delete(fileKey);
      }
    },
    requestTakeover: (fileKey) => takeover.requestTakeover(fileKey),
    armTakeover: () => {
      takeover.onTakeoverRequest(async (fileKey) => promptTakeover(fileKey));
    },
    autosaveForceSnapshot: async () => {
      const svc = createAutosaveService({ sessionStore: useDrawingSession });
      await svc.forceSnapshot();
    },
    autosaveList: async (handleKey) => {
      const svc = createAutosaveService({ sessionStore: useDrawingSession });
      const list = await svc.list(handleKey);
      return list.map((s) => ({
        handleKey: s.handleKey,
        iso: s.isoTimestamp,
        len: s.bytes.byteLength,
      }));
    },
    autosaveListKeys: () => listAllAutosaveLockKeys(),
    addAlignedDimension: (a, b, offset) => {
      const { slices, activeId, syncFromBus } = useDrawingSession.getState();
      const active = slices.find((s) => s.id === activeId);
      if (!active) return null;
      const cmd = alignedDimensionCommand({ a, b, offset });
      active.bus.execute(cmd);
      syncFromBus(active.id);
      return cmd.entityId;
    },
    moveEntities: (ids, delta) => {
      const { slices, activeId, syncFromBus } = useDrawingSession.getState();
      const active = slices.find((s) => s.id === activeId);
      if (!active) return;
      active.bus.execute(moveCommand({ ids, delta }));
      syncFromBus(active.id);
    },
    dimensionValue: (id) => {
      const { slices, activeId } = useDrawingSession.getState();
      const active = slices.find((s) => s.id === activeId);
      if (!active) return null;
      const g = recomputeDimensionGeometry(active.drawing, id);
      return g ? { numericValue: g.numericValue, value: g.value } : null;
    },
    get measureReadout() {
      const r = useMeasureState.getState().readout;
      return r ? { mode: r.mode, value: r.value, label: r.label } : null;
    },
    dispatchCommand: (name) => commandRouter.dispatch(name),
  };
  window.__modcad = api;
}

const heldLocks = new Map<string, WriterLock>();
