// Top-level Zustand store: owns one slice per tab-strip slot.
//
// Per plan.md "Cross-cutting decisions / Multi-document state slices":
// the active slot is the only one mounted to the renderer at a time;
// switching slots is a renderer re-mount + scene-graph upload, not a
// full reload.
//
// In-tab slots are coordinated by the in-process command bus only
// (FR-032 narrowed). Web Locks gate same-file-in-another-window.
import { create } from "zustand";
import { newDrawing, type Drawing } from "@modcad/core";
import { newId, type Id } from "@modcad/core";

export interface DrawingSlice {
  id: Id;
  name: string;
  drawing: Drawing;
  dirty: boolean;
  // CommandBus etc. wire in once Phase 2 command-bus agent lands.
  // Until then a slice is just a Drawing reference.
}

export interface DrawingSessionState {
  slices: DrawingSlice[];
  activeId: Id | null;
  // FR-033: open a fresh drawing in a new slot.
  openNew: (name?: string) => Id;
  close: (id: Id) => void;
  setActive: (id: Id) => void;
  rename: (id: Id, name: string) => void;
  reorder: (from: number, to: number) => void;
  /** FR-033 soft limit: warn callers when the next openNew would exceed 10. */
  isAtSoftLimit: () => boolean;
}

const SOFT_LIMIT = 10;

export const useDrawingSession = create<DrawingSessionState>((set, get) => ({
  slices: [],
  activeId: null,
  openNew: (name) => {
    const id = newId();
    const slice: DrawingSlice = {
      id,
      name: name ?? "Untitled",
      drawing: newDrawing(),
      dirty: false,
    };
    set((s) => ({ slices: [...s.slices, slice], activeId: id }));
    return id;
  },
  close: (id) => {
    set((s) => {
      const remaining = s.slices.filter((sl) => sl.id !== id);
      const nextActive =
        s.activeId === id ? (remaining[remaining.length - 1]?.id ?? null) : s.activeId;
      return { slices: remaining, activeId: nextActive };
    });
  },
  setActive: (id) => set({ activeId: id }),
  rename: (id, name) => {
    set((s) => ({
      slices: s.slices.map((sl) => (sl.id === id ? { ...sl, name } : sl)),
    }));
  },
  reorder: (from, to) => {
    set((s) => {
      const next = [...s.slices];
      const [moved] = next.splice(from, 1);
      if (!moved) return s;
      next.splice(to, 0, moved);
      return { slices: next };
    });
  },
  isAtSoftLimit: () => get().slices.length >= SOFT_LIMIT,
}));
