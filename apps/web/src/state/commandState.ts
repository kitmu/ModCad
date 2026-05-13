// Active-command UI state — read by CommandStatePanel (T060).
//
// US1 wires this directly from the tool layer (LineTool, RectangleTool, …)
// since the command palette / CommandRouter (Phase 4 / US2) doesn't exist yet.
// Tools call `setActive(name, step)` on start / step-change and `clear()` on
// commit/cancel; the panel re-renders from the slice.
import { create } from "zustand";

export interface CommandStep {
  /** User-facing prompt for the current step, e.g. "Pick first point". */
  prompt: string;
  /** Keystrokes valid at this step, e.g. ["Esc: cancel", "Enter: commit"]. */
  hints: string[];
}

export interface CommandStateValue {
  /** Internal command name, e.g. "draw.line". */
  name: string;
  /** Human-facing label, e.g. "Line". */
  label: string;
  step: CommandStep;
}

interface CommandState {
  active: CommandStateValue | null;
  setActive: (v: CommandStateValue) => void;
  setStep: (step: CommandStep) => void;
  clear: () => void;
}

export const useCommandState = create<CommandState>((set) => ({
  active: null,
  setActive: (v) => set({ active: v }),
  setStep: (step) =>
    set((s) => (s.active ? { active: { ...s.active, step } } : s)),
  clear: () => set({ active: null }),
}));
