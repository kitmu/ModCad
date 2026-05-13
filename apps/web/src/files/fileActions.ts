// File-menu actions (FR-016: save / open / new) decoupled from React so
// keyboard shortcuts in CanvasHost can call them without going through
// the menu UI.
import { readModcad, writeModcad } from "@modcad/codecs";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { openBytes, saveBytes } from "./fsAccess.js";

/**
 * Save the active slice to disk via the File System Access API (or the
 * download fallback). Clears the slice's dirty flag and exposes the
 * written bytes on the dev API for the e2e tests.
 *
 * Returns the chosen file name (or null if the user cancelled).
 */
export async function saveActiveDrawing(): Promise<string | null> {
  const { slices, activeId, setDirty, rename } = useDrawingSession.getState();
  const active = slices.find((s) => s.id === activeId);
  if (!active) return null;
  const bytes = writeModcad(active.drawing);
  const suggested = active.name.endsWith(".modcad")
    ? active.name
    : `${active.name}.modcad`;
  const name = await saveBytes(bytes, suggested);
  if (name === null) return null;
  setDirty(active.id, false);
  if (name !== active.name) rename(active.id, name);
  if (typeof window !== "undefined" && window.__modcad) {
    window.__modcad.lastSavedBytes = bytes;
  }
  return name;
}

/**
 * Open a .modcad file from disk. Replaces the active slice's drawing
 * (creates a new slice if none is active).
 */
export async function openDrawingFromDisk(): Promise<boolean> {
  const opened = await openBytes();
  if (opened === null) return false;
  const { drawing } = readModcad(opened.bytes);
  const { activeId, openNew, replaceDrawing } = useDrawingSession.getState();
  const targetId = activeId ?? openNew(opened.name);
  replaceDrawing(targetId, drawing, opened.name);
  return true;
}

/** FR-016 new — open a fresh untitled slice. */
export function newDrawing(): void {
  useDrawingSession.getState().openNew();
}
