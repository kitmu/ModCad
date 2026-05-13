// MeasureTool publishes its current readout here; MeasureOverlay
// renders from this slice. The tool never persists entities — the
// state lives only as long as the tool is active.
import { create } from "zustand";
import type { Vec2Type } from "@modcad/core";

export type MeasureMode = "distance" | "angle" | "area";

export interface MeasureReadout {
  mode: MeasureMode;
  points: Vec2Type[];
  /** Numeric result, units depend on `mode` (length / degrees / square units). */
  value: number;
  /** Human-readable string already formatted for display. */
  label: string;
}

interface MeasureState {
  readout: MeasureReadout | null;
  set: (readout: MeasureReadout | null) => void;
}

export const useMeasureState = create<MeasureState>((set) => ({
  readout: null,
  set: (readout) => set({ readout }),
}));
