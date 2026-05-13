// T119 — User preference for the perf overlay (fps + draw calls).
//
// Was: a debug-only flag baked into the renderer. Now: an opt-in
// user preference persisted in IDB so it survives reloads. Default
// is off — the overlay should never be visible to first-time users.
import { create } from "zustand";
import { idbGet, idbSet } from "../storage/idb.js";

const KEY = "modcad.pref.perfOverlay";

interface PerfOverlayPrefState {
  enabled: boolean;
  // True once the persisted preference has loaded from IDB. Until
  // then renderers should treat the value as tentative.
  hydrated: boolean;
  set: (enabled: boolean) => void;
  toggle: () => void;
}

export const usePerfOverlayPref = create<PerfOverlayPrefState>((set, get) => ({
  enabled: false,
  hydrated: false,
  set: (enabled) => {
    set({ enabled });
    void idbSet(KEY, enabled);
  },
  toggle: () => {
    get().set(!get().enabled);
  },
}));

/**
 * Hydrate the pref from IDB. Idempotent — safe to call multiple times,
 * a no-op once hydrated.
 */
export async function hydratePerfOverlayPref(): Promise<void> {
  if (usePerfOverlayPref.getState().hydrated) return;
  const stored = await idbGet<boolean>(KEY);
  usePerfOverlayPref.setState({
    enabled: typeof stored === "boolean" ? stored : false,
    hydrated: true,
  });
}
