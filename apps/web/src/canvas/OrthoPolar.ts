// F8 (ortho) / F10 (polar) keyboard toggles. Both flip flags on the
// active Drawing's `DrawingSettings`; per FR-006 the change goes
// through the command bus so a Ctrl-Z reverts it.
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { setOrthoCommand, setPolarCommand } from "../commands/settings.js";

export function handleOrthoPolarKey(e: KeyboardEvent): boolean {
  if (e.code !== "F8" && e.code !== "F10") return false;
  const { slices, activeId, applyCommand } = useDrawingSession.getState();
  const active = slices.find((s) => s.id === activeId);
  if (!active) return false;
  e.preventDefault();
  if (e.code === "F8") {
    applyCommand(setOrthoCommand(!active.drawing.settings.orthoMode));
  } else {
    applyCommand(setPolarCommand(active.drawing.settings.polarAngles.length === 0));
  }
  return true;
}
