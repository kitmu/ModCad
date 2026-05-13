// Keybinding store (T068).
//
// Holds a `Map<binding, commandName>` keyed by upper-cased key strings
// (e.g. `"L"`, `"REC"`). Defaults come from `builtinRegistry`'s
// `defaultBinding`; user overrides persist into IndexedDB so a user
// who remaps `L` to `view.fit` keeps that across reloads.
//
// The store does not execute commands; it is a lookup. The router
// in apps/web/src/palette/dispatch.ts resolves `commandName` →
// handler.
import { create } from "zustand";
import { builtinRegistry } from "@modcad/core";
import { idbGet, idbSet } from "../storage/idb.js";

const IDB_KEY = "keybindings.v1";

export interface KeybindingState {
  /** Loaded overrides + defaults, merged. Keys are upper-case. */
  bindings: Map<string, string>;
  /** True once IDB has been read (or determined unavailable). */
  hydrated: boolean;
  /** Replace the command bound to a key. Persists. */
  setBinding: (key: string, commandName: string) => void;
  /** Remove an override (revert to default). Persists. */
  clearBinding: (key: string) => void;
  /** Force-hydrate from IDB. Called once at app boot. */
  hydrate: () => Promise<void>;
}

function defaultBindings(): Map<string, string> {
  const m = new Map<string, string>();
  for (const def of builtinRegistry.all()) {
    if (def.defaultBinding !== undefined && def.defaultBinding !== "") {
      m.set(def.defaultBinding.toUpperCase(), def.name);
    }
  }
  return m;
}

export const useKeybindings = create<KeybindingState>((set, get) => ({
  bindings: defaultBindings(),
  hydrated: false,
  setBinding: (key, commandName) => {
    const upper = key.toUpperCase();
    const next = new Map(get().bindings);
    next.set(upper, commandName);
    set({ bindings: next });
    void persist(next);
  },
  clearBinding: (key) => {
    const upper = key.toUpperCase();
    const next = new Map(get().bindings);
    next.delete(upper);
    // Re-add default if there is one.
    for (const def of builtinRegistry.all()) {
      if (def.defaultBinding?.toUpperCase() === upper) {
        next.set(upper, def.name);
        break;
      }
    }
    set({ bindings: next });
    void persist(next);
  },
  hydrate: async () => {
    const saved = await idbGet<Record<string, string>>(IDB_KEY);
    if (saved && typeof saved === "object") {
      const next = defaultBindings();
      for (const [k, v] of Object.entries(saved)) {
        if (typeof v === "string" && builtinRegistry.byName(v)) {
          next.set(k.toUpperCase(), v);
        }
      }
      set({ bindings: next, hydrated: true });
    } else {
      set({ hydrated: true });
    }
  },
}));

async function persist(bindings: Map<string, string>): Promise<void> {
  const record: Record<string, string> = {};
  for (const [k, v] of bindings) record[k] = v;
  await idbSet(IDB_KEY, record);
}
