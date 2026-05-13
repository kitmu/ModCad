// Project-wide swatch store — used by the ColorPicker's "recent" row.
//
// Persisted via localStorage as a stopgap; the IDB-backed preferences
// store from US2 (FR-031 autosave + global prefs) is the eventual home
// and we'll migrate when it lands. The data shape is forward-compatible
// (array of RGBA records) so the migration is a one-time read.
// TODO(T046): move to the IDB preferences wrapper alongside other
// global defaults.
import type { RGBA } from "./aciPalette.js";

const KEY = "modcad.colorpicker.swatches";
const MAX = 16;

function isRGBA(value: unknown): value is RGBA {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["r"] === "number" &&
    typeof v["g"] === "number" &&
    typeof v["b"] === "number" &&
    typeof v["a"] === "number"
  );
}

export function loadSwatches(): RGBA[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRGBA);
  } catch {
    return [];
  }
}

export function saveSwatches(list: RGBA[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function rememberSwatch(c: RGBA): RGBA[] {
  const existing = loadSwatches();
  const eq = (a: RGBA, b: RGBA): boolean =>
    a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  const filtered = existing.filter((x) => !eq(x, c));
  const next = [c, ...filtered].slice(0, MAX);
  saveSwatches(next);
  return next;
}
