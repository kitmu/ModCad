// T121 — Light/dark theme preference store (FR-026).
//
// Three values:
//   - "system": follow the OS preference (CSS `prefers-color-scheme`)
//   - "light":  always light chrome
//   - "dark":   always dark chrome
//
// The applied theme is mirrored to `<html data-theme="…">` so Tailwind
// `dark:` variants resolve through `darkMode: ["class", "[data-theme='dark']"]`.
import { create } from "zustand";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "modcad.theme";

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage may be blocked; fall through.
  }
  return "system";
}

function writeStored(value: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
}

export const useThemeState = create<ThemeState>((set) => ({
  preference: readStored(),
  setPreference: (value) => {
    writeStored(value);
    set({ preference: value });
  },
}));

/**
 * Resolve the user's preference into the concrete theme that should be
 * applied right now. "system" is resolved against the media query.
 */
export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
