// Palette / command-line bar state slice (T066).
//
// The bottom-of-screen command-line bar is always visible (legacy
// AutoCAD muscle memory). The Ctrl/Cmd-K palette is a fuller overlay
// of the same input model: they share the query, the selected result
// index, and the last error message.
//
// US2 acceptance scenario 3 ("typing numeric coordinates routes to
// the active tool") is owned by the *consumer* of this slice — the
// CommandLineBar/CommandPalette components decide when input looks
// like a coordinate and call `parseCoord` against the active tool's
// last-point context. This slice is intentionally model-only.
import { create } from "zustand";

export interface PaletteState {
  /** Whether the modal palette overlay is visible. */
  open: boolean;
  /** Whether the bindings-reference modal is visible. */
  bindingsOpen: boolean;
  /** Current input string. Drives the fuzzy ranker downstream. */
  query: string;
  /** Selected row index (palette only — bar has no list view). */
  selectedIndex: number;
  /** Last inline error to show under the input (parseCoord failure, …). */
  error: string | null;
  setOpen: (open: boolean) => void;
  setBindingsOpen: (open: boolean) => void;
  setQuery: (q: string) => void;
  setSelectedIndex: (i: number) => void;
  setError: (e: string | null) => void;
  /** Reset to a closed, empty state (typically after a command runs). */
  reset: () => void;
}

export const usePaletteState = create<PaletteState>((set) => ({
  open: false,
  bindingsOpen: false,
  query: "",
  selectedIndex: 0,
  error: null,
  setOpen: (open) => set({ open, ...(open ? {} : { query: "", selectedIndex: 0, error: null }) }),
  setBindingsOpen: (bindingsOpen) => set({ bindingsOpen }),
  setQuery: (query) => set({ query, selectedIndex: 0, error: null }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setError: (error) => set({ error }),
  reset: () => set({ open: false, query: "", selectedIndex: 0, error: null }),
}));
