// Tiny store for the currently-armed snap candidate. Tools write it on
// pointermove; CommandStatePanel/dev-API/visual snap-marker read it.
import { create } from "zustand";
import type { Vec2Type } from "@modcad/core";

interface SnapState {
  point: Vec2Type | null;
  set: (point: Vec2Type | null) => void;
}

export const useSnapState = create<SnapState>((set) => ({
  point: null,
  set: (point) => set({ point }),
}));
