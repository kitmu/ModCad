// FR-033 — keyboard cycle for the in-app tab strip.
//
// Bindings:
//   Ctrl/Cmd-Tab        → next slot
//   Ctrl/Cmd-Shift-Tab  → previous slot
//   Ctrl/Cmd-W          → close active slot
//
// Browsers reserve Ctrl-Tab for native tab switching, so this handler
// is best-effort there; in practice the binding most useful for users
// is Ctrl/Cmd-W on the active slot.
import { useDrawingSession } from "./DrawingSessionStore.js";

function cycle(direction: 1 | -1): void {
  const { slices, activeId, setActive } = useDrawingSession.getState();
  if (slices.length === 0) return;
  const i = slices.findIndex((s) => s.id === activeId);
  const next = slices[(i + direction + slices.length) % slices.length];
  if (next) setActive(next.id);
}

function closeActive(): void {
  const { activeId, close } = useDrawingSession.getState();
  if (activeId) close(activeId);
}

export function installTabKeyboard(): () => void {
  if (typeof window === "undefined") return () => {};
  const onKey = (e: KeyboardEvent): void => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === "Tab") {
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "w" || e.key === "W") {
      e.preventDefault();
      closeActive();
    }
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}
