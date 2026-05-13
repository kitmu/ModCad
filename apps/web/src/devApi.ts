// Window-mounted introspection hook for Playwright e2e tests.
//
// The US1 specs need to assert on store state (entity counts, dirty flag,
// last-saved bytes) without DOM scraping. The renderer + tool layer is
// pure GPU pixels, so DOM-only assertions would be brittle.
//
// Mounted unconditionally in dev/test builds; production should tree-shake
// it via Vite's `import.meta.env.PROD` guard in main.tsx if/when desired.
import type { Drawing, Vec2Type } from "@modcad/core";
import { readModcad, writeModcad } from "@modcad/codecs";
import { useDrawingSession } from "./workspace/DrawingSessionStore.js";
import { useCommandState } from "./state/commandState.js";
import { useSnapState } from "./state/snapState.js";
import {
  installFsAccessOverrides,
  type FsAccessOverrides,
} from "./files/fsAccess.js";

export interface DevApi {
  /** Snapshot of the active drawing (or null if no slice is open). */
  readonly activeDrawing: Drawing | null;
  /** Last bytes written by Save (FR-031 / US1.3). Set by FileMenu's save handler. */
  lastSavedBytes: Uint8Array | null;
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
  };
  window.__modcad = api;
}
