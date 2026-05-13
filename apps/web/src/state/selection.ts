// Selection store — derived UI state per data-model.md "Selection".
//
// Selection is not persisted; it travels with the active slot. v1
// surface is a flat ordered Set keyed by entity id. PropertiesPanel
// reads from here; tools (move, copy, …) will mutate it.
import { create } from "zustand";
import type { Id } from "@modcad/core";

interface SelectionState {
  // Per-slice selection. Map<sliceId, Set<entityId>>.
  bySlice: Record<string, ReadonlyArray<Id>>;
  set: (sliceId: string, ids: ReadonlyArray<Id>) => void;
  clear: (sliceId: string) => void;
  get: (sliceId: string) => ReadonlyArray<Id>;
}

export const useSelection = create<SelectionState>((set, get) => ({
  bySlice: {},
  set: (sliceId, ids) =>
    set((s) => ({ bySlice: { ...s.bySlice, [sliceId]: ids } })),
  clear: (sliceId) =>
    set((s) => {
      const next = { ...s.bySlice };
      delete next[sliceId];
      return { bySlice: next };
    }),
  get: (sliceId) => get().bySlice[sliceId] ?? [],
}));
