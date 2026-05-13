// Flat selection state for the active slot. Grips, tools, and CanvasHost
// read from here. The richer per-slice store at ./selection.ts (for
// PropertiesPanel / multi-doc) co-exists; this slice is the active-slot
// projection that US6 tooling needs. They're kept in sync by the
// selection wiring in Selection.ts.
import { create } from "zustand";
import type { Id } from "@modcad/core";

export interface SelectionStateShape {
  ids: ReadonlyArray<Id>;
  setIds: (ids: ReadonlyArray<Id>) => void;
  add: (id: Id) => void;
  remove: (id: Id) => void;
  toggle: (id: Id) => void;
  clear: () => void;
}

export const useSelectionState = create<SelectionStateShape>((set, get) => ({
  ids: [],
  setIds: (ids) => set({ ids }),
  add: (id) => set({ ids: [...get().ids.filter((x) => x !== id), id] }),
  remove: (id) => set({ ids: get().ids.filter((x) => x !== id) }),
  toggle: (id) => {
    const ids = get().ids;
    set({ ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  },
  clear: () => set({ ids: [] }),
}));
