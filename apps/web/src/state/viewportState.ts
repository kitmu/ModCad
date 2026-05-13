// Viewport state — minimal world↔screen exposure for DOM overlays
// (Grips, future floating annotations). CanvasHost updates this slice
// whenever the camera or canvas rect changes; readers (Grips) re-render
// on subscribe.
import { create } from "zustand";
import type { Vec2Type } from "@modcad/core";

interface ViewportState {
  center: Vec2Type;
  zoom: number;
  rect: { left: number; top: number; width: number; height: number } | null;
  set: (next: Partial<Omit<ViewportState, "set">>) => void;
}

export const useViewportState = create<ViewportState>((set) => ({
  center: [0, 0],
  zoom: 1,
  rect: null,
  set: (next) => set(next),
}));
