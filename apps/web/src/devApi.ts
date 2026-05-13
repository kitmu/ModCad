// Window-mounted introspection hook for Playwright e2e tests.
//
// The US1 specs need to assert on store state (entity counts, dirty flag,
// last-saved bytes) without DOM scraping. The renderer + tool layer is
// pure GPU pixels, so DOM-only assertions would be brittle.
//
// Mounted unconditionally in dev/test builds; production should tree-shake
// it via Vite's `import.meta.env.PROD` guard in main.tsx if/when desired.
import type { Drawing } from "@modcad/core";
import { useDrawingSession } from "./workspace/DrawingSessionStore.js";
import { useCommandState } from "./state/commandState.js";
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
  /** Replace the active drawing (used by the reopen-from-bytes test). */
  loadDrawing: (drawing: Drawing) => void;
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
    lastSavedBytes: null,
    loadDrawing: (drawing) => {
      const { slices, activeId, replaceDrawing, openNew } =
        useDrawingSession.getState();
      const targetId = activeId ?? openNew();
      const present = slices.some((s) => s.id === targetId);
      if (!present) {
        // openNew just created the slot; replaceDrawing handles it.
      }
      replaceDrawing(targetId, drawing);
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
