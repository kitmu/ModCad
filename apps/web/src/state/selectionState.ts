// US6 — selection model state. A simple `Set<Id>` of selected entity
// ids, mutated by Selection.ts (the canvas-host's selection helper)
// and read by Grips.tsx + HistoryPanel.tsx.
//
// Per FR-005 / FR-025a, the selection persists across tool activations
// (so the user can pre-select then invoke a command, or invoke first
// then post-select). Tools that consume a pre-selection clear it on
// commit; the modify-with-grips flow leaves it alone.
import { create } from "zustand";
import type { Id } from "@modcad/core";

export type ClickMode = "replace" | "add" | "toggle";

interface SelectionState {
  ids: ReadonlySet<Id>;
  /** Mode-aware click: replace, add (shift), toggle (ctrl). */
  click: (id: Id, mode: ClickMode) => void;
  /** Bulk set (used by window/crossing rectangles and select-all). */
  setMany: (ids: ReadonlyArray<Id>, mode: ClickMode) => void;
  /** Remove specific ids (used by commands that delete entities). */
  forget: (ids: ReadonlyArray<Id>) => void;
  /** Clear all selection (Escape). */
  clear: () => void;
  /** True if `id` is selected. */
  has: (id: Id) => boolean;
}

export const useSelectionState = create<SelectionState>((set, get) => ({
  ids: new Set<Id>(),
  click: (id, mode) => {
    set((s) => {
      const next = new Set<Id>(s.ids);
      if (mode === "replace") {
        next.clear();
        next.add(id);
      } else if (mode === "add") {
        next.add(id);
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return { ids: next };
    });
  },
  setMany: (ids, mode) => {
    set((s) => {
      const next = new Set<Id>(mode === "replace" ? [] : s.ids);
      for (const id of ids) {
        if (mode === "toggle" && next.has(id)) next.delete(id);
        else next.add(id);
      }
      return { ids: next };
    });
  },
  forget: (ids) => {
    set((s) => {
      const next = new Set<Id>(s.ids);
      for (const id of ids) next.delete(id);
      return { ids: next };
    });
  },
  clear: () => set({ ids: new Set<Id>() }),
  has: (id) => get().ids.has(id),
}));
