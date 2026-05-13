// FR-031 — surface the most-recent autosave timestamp per handleKey so
// the UI can render "last autosave: Ns ago" without reaching into OPFS
// on every render. Updated by `autosave.ts` on each successful flush.
import { create } from "zustand";

interface AutosaveState {
  /** handleKey -> ISO timestamp of the most recent autosave. */
  lastByHandle: Record<string, string>;
  recordSnapshot: (handleKey: string, isoTimestamp: string) => void;
  clear: () => void;
}

export const useAutosaveState = create<AutosaveState>((set) => ({
  lastByHandle: {},
  recordSnapshot: (handleKey, isoTimestamp) =>
    set((s) => ({
      lastByHandle: { ...s.lastByHandle, [handleKey]: isoTimestamp },
    })),
  clear: () => set({ lastByHandle: {} }),
}));
