// Global keyboard wiring for the palette + bindings overlay (T066, T068).
//
// - Ctrl/Cmd-K → toggle palette (FR-023).
// - `?` (Shift+/) from outside an input → toggle bindings reference.
// - Escape → close palette / bindings.
// - Otherwise, look up the key against the keybinding map; if it
//   resolves to a registered command, dispatch it.
//
// Tool-specific single-letter shortcuts (L, R, C, …) used to live in
// CanvasHost; now they flow through the keybinding store so user
// overrides apply uniformly. CanvasHost still owns the *handler*
// side: it registers the draw.* commands with the router on mount.
import { useEffect } from "react";
import { usePaletteState } from "../state/paletteState.js";
import { useKeybindings } from "../state/keybindingStore.js";
import { commandRouter } from "./commandRouter.js";

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return true;
  if (t.isContentEditable) return true;
  return false;
}

export function PaletteKeyboard(): null {
  const setOpen = usePaletteState((s) => s.setOpen);
  const setBindingsOpen = usePaletteState((s) => s.setBindingsOpen);
  const hydrate = useKeybindings((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Ctrl/Cmd-K toggles the palette from anywhere — including
      // inside the palette input (so users can dismiss it).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const { open } = usePaletteState.getState();
        setOpen(!open);
        return;
      }
      // Escape closes the bindings modal first, then the palette.
      if (e.key === "Escape") {
        const s = usePaletteState.getState();
        if (s.bindingsOpen) {
          setBindingsOpen(false);
          // Don't preventDefault — tools may also want Escape.
        } else if (s.open) {
          setOpen(false);
        }
        return;
      }
      // From outside an editable target only:
      if (isEditableTarget(e.target)) return;
      // `?` opens the bindings reference.
      if (e.key === "?") {
        e.preventDefault();
        const s = usePaletteState.getState();
        setBindingsOpen(!s.bindingsOpen);
        return;
      }
      // Look up plain-key shortcuts against the keybinding map.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const upper = e.key.toUpperCase();
      const { bindings } = useKeybindings.getState();
      const cmd = bindings.get(upper);
      if (!cmd) return;
      const fired = commandRouter.dispatch(cmd);
      if (fired) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [setOpen, setBindingsOpen]);

  return null;
}
