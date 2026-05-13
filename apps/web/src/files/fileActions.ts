// File-menu actions (FR-016: save / open / new) decoupled from React so
// keyboard shortcuts in CanvasHost can call them without going through
// the menu UI.
import {
  readModcad,
  writeModcad,
  readDxf,
  writeDxf,
  writeSvg,
  writePdf,
  type PaperSize,
} from "@modcad/codecs";
import type { Drawing, Id } from "@modcad/core";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { openBytes, saveBytes } from "./fsAccess.js";
import { surfaceDxfWarnings } from "../notifications/ImportWarnings.js";
import { lockKeyFor, recordManualSave } from "./autosave.js";

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
  // FR-031: manual save does not consume an autosave slot, but record
  // the timestamp so restore-prompt logic can compare.
  await recordManualSave(lockKeyFor(active.id, name));
  return name;
}

/**
 * Open a .modcad file from disk. FR-033: opens into a fresh tab-strip
 * slot rather than replacing the active drawing.
 */
export async function openDrawingFromDisk(): Promise<boolean> {
  const opened = await openBytes();
  if (opened === null) return false;
  const { drawing } = readModcad(opened.bytes);
  const { openNew, replaceDrawing } = useDrawingSession.getState();
  const id = openNew(opened.name);
  replaceDrawing(id, drawing, opened.name);
  return true;
}

/** FR-016 new — open a fresh untitled slice. */
export function newDrawing(): void {
  useDrawingSession.getState().openNew();
}

/**
 * FR-017: import a DXF file. Opens into a fresh slice and surfaces
 * any reader warnings through the notifications toaster.
 */
export async function importDxfFromDisk(): Promise<boolean> {
  const opened = await openBytes();
  if (opened === null) return false;
  const text = new TextDecoder().decode(opened.bytes);
  const { drawing, warnings } = readDxf(text);
  const { openNew, replaceDrawing } = useDrawingSession.getState();
  const id = openNew(opened.name);
  replaceDrawing(id, drawing, opened.name);
  surfaceDxfWarnings(warnings);
  return true;
}

export type ExportFormat = "dxf" | "svg" | "pdf";

export interface ExportOptions {
  format: ExportFormat;
  paperSize?: PaperSize;
  orientation?: "portrait" | "landscape";
  /** When provided, exported entities/layers are filtered to these ids. */
  layerIds?: readonly string[];
}

/**
 * FR-017 / FR-018: export the active drawing in the chosen format.
 * Returns the chosen file name (or null if the user cancelled).
 *
 * Layer filtering: we don't mutate the source drawing; instead we
 * clone it and strip layers (+ their entities) outside `layerIds`.
 */
export async function exportActiveDrawing(opts: ExportOptions): Promise<string | null> {
  const { slices, activeId } = useDrawingSession.getState();
  const active = slices.find((s) => s.id === activeId);
  if (!active) return null;
  const drawing = filterDrawingByLayers(active.drawing, opts.layerIds);
  const base = stripExtension(active.name);
  let bytes: Uint8Array;
  let suggested: string;
  switch (opts.format) {
    case "dxf":
      bytes = new TextEncoder().encode(writeDxf(drawing));
      suggested = `${base}.dxf`;
      break;
    case "svg":
      bytes = new TextEncoder().encode(writeSvg(drawing));
      suggested = `${base}.svg`;
      break;
    case "pdf":
      bytes = await writePdf(drawing, {
        ...(opts.paperSize !== undefined ? { paperSize: opts.paperSize } : {}),
        ...(opts.orientation !== undefined ? { orientation: opts.orientation } : {}),
      });
      suggested = `${base}.pdf`;
      break;
  }
  const name = await saveBytes(bytes, suggested);
  if (typeof window !== "undefined" && window.__modcad) {
    window.__modcad.lastExportBytes = bytes;
    window.__modcad.lastExportFormat = opts.format;
  }
  return name;
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function filterDrawingByLayers(
  drawing: Drawing,
  layerIds: readonly string[] | undefined,
): Drawing {
  if (!layerIds || layerIds.length === 0) return drawing;
  const keep = new Set(layerIds);
  const layers = drawing.layers.filter((l) => keep.has(l.id));
  const layerOrder = drawing.layerOrder.filter((id) => keep.has(id)) as Id[];
  const entityOrder: Id[] = [];
  const entities: typeof drawing.entities = {};
  for (const id of drawing.entityOrder) {
    const e = drawing.entities[id];
    if (!e || !keep.has(e.layerId)) continue;
    entities[id] = e;
    entityOrder.push(id);
  }
  return { ...drawing, layers, layerOrder, entities, entityOrder };
}
