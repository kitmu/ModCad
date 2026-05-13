// US6 — Selection helper. CanvasHost dispatches pointer events here
// when no tool is active. Click picks the topmost entity under the
// cursor; pointer-drag yields a window-or-crossing rectangle (window
// = left-to-right = contains-only; crossing = right-to-left = any
// intersection). Reads/writes the per-slice selection store the
// PropertiesPanel (US3) already shares with the rest of the app.
import {
  bboxOfEntity,
  buildStaticIndex,
  type BboxType,
  type Drawing,
  type Entity,
  type Id,
  type Vec2Type,
} from "@modcad/core";
import { useSelection } from "../state/selection.js";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import type { PointerSample } from "./PointerInput.js";

type ClickMode = "replace" | "add" | "toggle";

const CLICK_TOLERANCE_WORLD = 4;

function modeFromEvent(shiftKey: boolean, ctrlKey: boolean): ClickMode {
  if (ctrlKey) return "toggle";
  if (shiftKey) return "add";
  return "replace";
}

function applyClick(
  current: ReadonlyArray<Id>,
  id: Id,
  mode: ClickMode,
): Id[] {
  const set = new Set<Id>(current);
  if (mode === "replace") return [id];
  if (mode === "add") {
    set.add(id);
    return [...set];
  }
  // toggle
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set];
}

function applyMany(
  current: ReadonlyArray<Id>,
  ids: ReadonlyArray<Id>,
  mode: ClickMode,
): Id[] {
  if (mode === "replace") return [...ids];
  const set = new Set<Id>(current);
  for (const id of ids) {
    if (mode === "toggle" && set.has(id)) set.delete(id);
    else set.add(id);
  }
  return [...set];
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

function pointToSegDistance(p: Vec2Type, a: Vec2Type, b: Vec2Type): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distanceToEntity(p: Vec2Type, e: Entity): number {
  switch (e.kind) {
    case "line":
      return pointToSegDistance(p, e.a, e.b);
    case "polyline": {
      let best = Infinity;
      for (let i = 0; i < e.vertices.length - 1; i++) {
        const d = pointToSegDistance(p, e.vertices[i]!.p, e.vertices[i + 1]!.p);
        if (d < best) best = d;
      }
      if (e.closed && e.vertices.length > 2) {
        const d = pointToSegDistance(
          p,
          e.vertices[e.vertices.length - 1]!.p,
          e.vertices[0]!.p,
        );
        if (d < best) best = d;
      }
      return best;
    }
    case "circle": {
      const r = Math.hypot(p[0] - e.c[0], p[1] - e.c[1]);
      return Math.abs(r - e.r);
    }
    case "arc": {
      const dx = p[0] - e.c[0];
      const dy = p[1] - e.c[1];
      return Math.abs(Math.hypot(dx, dy) - e.r);
    }
    case "ellipse": {
      const dx = p[0] - e.c[0];
      const dy = p[1] - e.c[1];
      const m = Math.hypot(e.major[0], e.major[1]);
      return Math.abs(Math.hypot(dx, dy) - m);
    }
    case "point":
      return Math.hypot(p[0] - e.p[0], p[1] - e.p[1]);
    case "text":
      return Math.hypot(p[0] - e.anchor[0], p[1] - e.anchor[1]);
    case "dimension":
      return Infinity;
    default: {
      const _ex: never = e;
      void _ex;
      return Infinity;
    }
  }
}

function pickAt(
  drawing: Drawing,
  worldPoint: Vec2Type,
  tolerance: number,
): Id | null {
  const entries: { id: Id; bbox: BboxType }[] = [];
  for (const id of drawing.entityOrder) {
    const e = drawing.entities[id];
    if (!e) continue;
    entries.push({ id: id as Id, bbox: bboxOfEntity(e) });
  }
  const index = buildStaticIndex(entries);
  const candidates = new Set(index.queryPoint(worldPoint, tolerance));
  if (candidates.size === 0) return null;
  for (let i = drawing.entityOrder.length - 1; i >= 0; i--) {
    const id = drawing.entityOrder[i]! as Id;
    if (!candidates.has(id)) continue;
    const e = drawing.entities[id];
    if (!e) continue;
    if (distanceToEntity(worldPoint, e as Entity) <= tolerance) return id;
  }
  return null;
}

function currentSliceSelection(): {
  sliceId: string | null;
  selection: ReadonlyArray<Id>;
} {
  const sliceId = useDrawingSession.getState().activeId ?? null;
  if (!sliceId) return { sliceId: null, selection: [] };
  return { sliceId, selection: useSelection.getState().get(sliceId) };
}

export interface SelectionController {
  onPointerDown(s: PointerSample, shift: boolean, ctrl: boolean): void;
  onPointerMove(s: PointerSample): void;
  onPointerUp(s: PointerSample, shift: boolean, ctrl: boolean): void;
  selectAll(): void;
  clear(): void;
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

  const commit = (next: Id[]): void => {
    const { sliceId } = currentSliceSelection();
    if (!sliceId) return;
    useSelection.getState().set(sliceId, next);
  };

  return {
    onPointerDown(s) {
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
      const mode = modeFromEvent(shift, ctrl);
      const { selection } = currentSliceSelection();
      if (!start || !moved) {
        const id = pickAt(drawing, s.world, CLICK_TOLERANCE_WORLD);
        if (id) commit(applyClick(selection, id, mode));
        else if (mode === "replace") commit([]);
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
        } else if (
          eb.minX <= rect.maxX &&
          eb.maxX >= rect.minX &&
          eb.minY <= rect.maxY &&
          eb.maxY >= rect.minY
        ) {
          hits.push(id as Id);
        }
      }
      commit(applyMany(selection, hits, mode));
    },
    selectAll() {
      const drawing = ctx.getDrawing();
      if (!drawing) return;
      commit(drawing.entityOrder.map((id) => id as Id));
    },
    clear() {
      const { sliceId } = currentSliceSelection();
      if (!sliceId) return;
      useSelection.getState().set(sliceId, []);
    },
    getDragRect() {
      if (!dragStart || !dragCurrent) return null;
      return { a: dragStart, b: dragCurrent };
    },
  };
}
