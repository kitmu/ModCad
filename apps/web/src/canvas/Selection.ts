// US6 — Selection helper. CanvasHost dispatches pointer events here
// when no tool is active. Click picks the topmost entity under the
// cursor; pointer-drag yields a window-or-crossing rectangle (window
// = left-to-right = contains-only; crossing = right-to-left = any
// intersection).
//
// Hit-testing reuses the in-memory drawing rather than the spatial
// index because the index is rebuilt at commit time and we want
// selection to see the post-commit state without extra plumbing. The
// scene sizes US6 supports stay below the 50k-segment perf bar.
import {
  buildStaticIndex,
  type Bbox as BboxType,
  type Drawing,
  type Entity,
  type Id,
  type Vec2Type,
} from "@modcad/core";
import { bboxOfEntity } from "@modcad/core/geometry/primitives";
import {
  useSelectionState,
  type ClickMode,
} from "../state/selectionState.js";
import type { PointerSample } from "./PointerInput.js";

const CLICK_TOLERANCE_WORLD = 4; // pixels-equivalent at zoom = 1

function modeFromEvent(s: PointerSample, shiftKey: boolean, ctrlKey: boolean): ClickMode {
  if (ctrlKey) return "toggle";
  if (shiftKey) return "add";
  return "replace";
}

function rectFromCorners(a: Vec2Type, b: Vec2Type): BboxType {
  return {
    minX: Math.min(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxX: Math.max(a[0], b[0]),
    maxY: Math.max(a[1], b[1]),
  };
}

function isWindow(a: Vec2Type, b: Vec2Type): boolean {
  // Left-to-right = window (contains-only). Right-to-left = crossing.
  return b[0] >= a[0];
}

function bboxContainedInRect(eb: BboxType, rect: BboxType): boolean {
  return (
    eb.minX >= rect.minX &&
    eb.minY >= rect.minY &&
    eb.maxX <= rect.maxX &&
    eb.maxY <= rect.maxY
  );
}

function pickAt(
  drawing: Drawing,
  worldPoint: Vec2Type,
  tolerance: number,
): Id | null {
  // Build a transient static index over the current entities — cheaper
  // than carrying one in the canvas-host for v1 since the selection
  // path is not in the per-frame critical path.
  const entries: { id: Id; bbox: BboxType }[] = [];
  for (const id of drawing.entityOrder) {
    const e = drawing.entities[id];
    if (!e) continue;
    entries.push({ id: id as Id, bbox: bboxOfEntity(e) });
  }
  const index = buildStaticIndex(entries);
  const hits = index.queryPoint(worldPoint, tolerance);
  if (hits.length === 0) return null;
  // Topmost = last in entityOrder. Walk reverse to find the first hit.
  for (let i = drawing.entityOrder.length - 1; i >= 0; i--) {
    const id = drawing.entityOrder[i]!;
    if (hits.includes(id as Id)) return id as Id;
  }
  return hits[0] ?? null;
}

export interface SelectionController {
  /** Pointer down on the canvas when no tool is active. */
  onPointerDown(s: PointerSample, shift: boolean, ctrl: boolean): void;
  /** Pointer move — updates drag-rect rubber band if a drag is active. */
  onPointerMove(s: PointerSample): void;
  /** Pointer up — commits a drag-rect selection if one was active. */
  onPointerUp(s: PointerSample, shift: boolean, ctrl: boolean): void;
  /** Ctrl/Cmd-A select all visible entities. */
  selectAll(): void;
  /** Escape — clears selection. */
  clear(): void;
  /** Read the active drag-rect (for the rubber-band layer). */
  getDragRect(): { a: Vec2Type; b: Vec2Type } | null;
}

export interface SelectionContext {
  getDrawing: () => Drawing | null;
}

export function createSelectionController(
  ctx: SelectionContext,
): SelectionController {
  let dragStart: Vec2Type | null = null;
  let dragCurrent: Vec2Type | null = null;
  let movedSinceDown = false;

  return {
    onPointerDown(s, _shift, _ctrl) {
      dragStart = s.world;
      dragCurrent = s.world;
      movedSinceDown = false;
    },
    onPointerMove(s) {
      if (dragStart) {
        dragCurrent = s.world;
        const dx = s.world[0] - dragStart[0];
        const dy = s.world[1] - dragStart[1];
        if (Math.hypot(dx, dy) > 1e-6) movedSinceDown = true;
      }
    },
    onPointerUp(s, shift, ctrl) {
      const start = dragStart;
      dragStart = null;
      const moved = movedSinceDown;
      movedSinceDown = false;
      dragCurrent = null;
      const drawing = ctx.getDrawing();
      if (!drawing) return;
      const mode = modeFromEvent(s, shift, ctrl);
      if (!start || !moved) {
        // Treat as click.
        const id = pickAt(drawing, s.world, CLICK_TOLERANCE_WORLD);
        if (id) useSelectionState.getState().click(id, mode);
        else if (mode === "replace") useSelectionState.getState().clear();
        return;
      }
      const rect = rectFromCorners(start, s.world);
      const containsOnly = isWindow(start, s.world);
      const hits: Id[] = [];
      for (const id of drawing.entityOrder) {
        const e = drawing.entities[id];
        if (!e) continue;
        const eb = bboxOfEntity(e as Entity);
        if (containsOnly) {
          if (bboxContainedInRect(eb, rect)) hits.push(id as Id);
        } else {
          // Crossing = bbox intersects rect.
          if (
            eb.minX <= rect.maxX &&
            eb.maxX >= rect.minX &&
            eb.minY <= rect.maxY &&
            eb.maxY >= rect.minY
          ) {
            hits.push(id as Id);
          }
        }
      }
      useSelectionState.getState().setMany(hits, mode);
    },
    selectAll() {
      const drawing = ctx.getDrawing();
      if (!drawing) return;
      useSelectionState.getState().setMany(
        drawing.entityOrder.map((id) => id as Id),
        "replace",
      );
    },
    clear() {
      useSelectionState.getState().clear();
    },
    getDragRect() {
      if (!dragStart || !dragCurrent) return null;
      return { a: dragStart, b: dragCurrent };
    },
  };
}
