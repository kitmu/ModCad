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
import {
  CommandBus,
  newDrawing,
  type Command,
  type Drawing,
} from "@modcad/core";
import { newId, type Id } from "@modcad/core";

export interface DrawingSlice {
  id: Id;
  name: string;
  drawing: Drawing;
  dirty: boolean;
  bus: CommandBus;
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

  // Active-slice helpers — used by tools, file menu, and the e2e dev API.
  /** Execute a one-shot command on the active slice. No-op if no active slice. */
  applyCommand: (cmd: Command<unknown>) => void;
  /** Re-pull the drawing snapshot from a slice's bus (after begin/sub-step/commit/cancel). */
  syncFromBus: (id: Id) => void;
  /** Replace the drawing entirely (used by file open and dev API). Clears dirty. */
  replaceDrawing: (id: Id, drawing: Drawing, name?: string) => void;
  /** Mark dirty/clean (used by save). */
  setDirty: (id: Id, dirty: boolean) => void;
}

const SOFT_LIMIT = 10;

function makeSlice(name?: string, drawing?: Drawing): DrawingSlice {
  const d = drawing ?? newDrawing();
  return {
    id: newId(),
    name: name ?? "Untitled",
    drawing: d,
    dirty: false,
    bus: new CommandBus(d),
  };
}

export const useDrawingSession = create<DrawingSessionState>((set, get) => ({
  slices: [],
  activeId: null,
  openNew: (name) => {
    const slice = makeSlice(name);
    set((s) => ({ slices: [...s.slices, slice], activeId: slice.id }));
    return slice.id;
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

  applyCommand: (cmd) => {
    const { slices, activeId } = get();
    const active = slices.find((s) => s.id === activeId);
    if (!active) return;
    active.bus.execute(cmd);
    set({
      slices: slices.map((s) =>
        s.id === active.id ? { ...s, drawing: s.bus.drawing, dirty: true } : s,
      ),
    });
  },
  syncFromBus: (id) => {
    set((s) => ({
      slices: s.slices.map((sl) =>
        sl.id === id ? { ...sl, drawing: sl.bus.drawing, dirty: true } : sl,
      ),
    }));
  },
  replaceDrawing: (id, drawing, name) => {
    set((s) => ({
      slices: s.slices.map((sl) =>
        sl.id === id
          ? {
              ...sl,
              drawing,
              dirty: false,
              bus: new CommandBus(drawing),
              name: name ?? sl.name,
            }
          : sl,
      ),
    }));
  },
  setDirty: (id, dirty) => {
    set((s) => ({
      slices: s.slices.map((sl) => (sl.id === id ? { ...sl, dirty } : sl)),
    }));
  },
}));
