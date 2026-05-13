// Global default unit preference — FR-015a/b.
//
// Persisted to IndexedDB via the lightweight wrapper that lands with
// US2; until then we fall back to localStorage. TODO(T046): switch to
// the IDB-backed prefs store once available.
import type { Unit } from "@modcad/core";

const KEY = "modcad.prefs.units";

export function loadDefaultUnit(): Unit {
  if (typeof localStorage === "undefined") return "mm";
  const raw = localStorage.getItem(KEY);
  if (!raw) return "mm";
  if (raw === "mm" || raw === "cm" || raw === "m" || raw === "in" || raw === "ft") {
    return raw;
  }
  return "mm";
}

export function saveDefaultUnit(u: Unit): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, u);
}
