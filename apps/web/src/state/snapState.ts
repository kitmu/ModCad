// Tiny store for the currently-armed snap candidate. Tools write it on
// pointermove; CommandStatePanel/dev-API/visual snap-marker read it.
import { create } from "zustand";
import type { SnapMode, Vec2Type } from "@modcad/core";

export interface SnapMarker {
  point: Vec2Type;
  mode: SnapMode;
  strength: "hard" | "soft";
  /** Last committed point in-flight tool has — drives FR-008b inline measurement. */
  lastCommittedPoint: Vec2Type | null;
}

interface SnapState {
  point: Vec2Type | null;
  marker: SnapMarker | null;
  set: (point: Vec2Type | null) => void;
  setMarker: (marker: SnapMarker | null) => void;
}

export const useSnapState = create<SnapState>((set) => ({
  point: null,
  marker: null,
  set: (point) => set({ point }),
  setMarker: (marker) => set({ marker, point: marker?.point ?? null }),
}));
