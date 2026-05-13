// Origin rebase command — Constitution Principle I.
//
// When the active viewport center wanders past REBASE_TRIGGER units
// from the local origin, the caller issues an OriginRebaseCommand to
// recenter every entity in the drawing. Predicates evaluate in
// local-origin frame, so this preserves geometric meaning while
// keeping the coordinate magnitudes inside the Tier-A precision band.
//
// Pure data transform; goes through the CommandBus so it's undoable
// like any other mutation. The bus is responsible for emitting the
// `origin-rebased` KernelEvent after the command commits — callers
// invoke `bus.emit(...)` themselves rather than baking the side
// channel into the command record.
import type { Vec2 } from "../geometry/Vec2.js";
import type { Command } from "../commands/CommandBus.js";
import type { Drawing, Entity, PolylineVertex } from "./types.js";
import type { Draft } from "immer";

export interface OriginRebaseParams {
  newOrigin: Vec2;
}

function shiftPoint(p: Vec2, dx: number, dy: number): Vec2 {
  return [p[0] + dx, p[1] + dy];
}

function shiftEntity(e: Entity, dx: number, dy: number): void {
  switch (e.kind) {
    case "line":
      e.a = shiftPoint(e.a, dx, dy);
      e.b = shiftPoint(e.b, dx, dy);
      return;
    case "polyline":
      e.vertices = e.vertices.map(
        (v): PolylineVertex => ({ p: shiftPoint(v.p, dx, dy), bulge: v.bulge }),
      );
      return;
    case "circle":
    case "arc":
      e.c = shiftPoint(e.c, dx, dy);
      return;
    case "ellipse":
      e.c = shiftPoint(e.c, dx, dy);
      return;
    case "point":
      e.p = shiftPoint(e.p, dx, dy);
      return;
    case "text":
      e.anchor = shiftPoint(e.anchor, dx, dy);
      return;
    case "dimension":
      // Dimension refs may hold inline Vec2 anchors that need shifting;
      // EntityPointRef-based references resolve at render time from the
      // entity they point to, so they need no adjustment here.
      shiftDimensionRefs(e, dx, dy);
      return;
  }
}

function isVec2(
  v: Vec2 | { entityId: unknown; point: unknown },
): v is Vec2 {
  return Array.isArray(v);
}

function shiftDimensionRefs(
  e: Extract<Entity, { kind: "dimension" }>,
  dx: number,
  dy: number,
): void {
  const r = e.refs;
  switch (r.variant) {
    case "linear":
    case "aligned":
      if (isVec2(r.a)) r.a = shiftPoint(r.a, dx, dy);
      if (isVec2(r.b)) r.b = shiftPoint(r.b, dx, dy);
      return;
    case "angular":
      r.v = shiftPoint(r.v, dx, dy);
      if (isVec2(r.a)) r.a = shiftPoint(r.a, dx, dy);
      if (isVec2(r.b)) r.b = shiftPoint(r.b, dx, dy);
      return;
    case "radial":
    case "diameter":
      return;
  }
}

function shiftAll(draft: Draft<Drawing>, dx: number, dy: number): void {
  for (const id of draft.entityOrder) {
    const e = draft.entities[id];
    if (e) shiftEntity(e, dx, dy);
  }
  draft.originOffset = [draft.originOffset[0] + dx, draft.originOffset[1] + dy];
}

export function originRebaseCommand(
  newOrigin: Vec2,
): Command<OriginRebaseParams> {
  // We shift entity coordinates by -(newOrigin - currentOrigin), where
  // currentOrigin is the drawing's `originOffset` at the moment apply
  // runs. The prior origin is captured in this closure so `inverse`
  // can revert exactly even if other commands ran in between (they
  // can't right now — the bus serializes — but capturing keeps the
  // command record self-contained and side-effect-free at undo time).
  let capturedPrev: Vec2 | null = null;
  return {
    name: "view.originRebase",
    params: { newOrigin },
    apply(draft) {
      const cur = draft.originOffset;
      capturedPrev = [cur[0], cur[1]];
      const dx = -(newOrigin[0] - cur[0]);
      const dy = -(newOrigin[1] - cur[1]);
      shiftAll(draft, dx, dy);
      draft.originOffset = [newOrigin[0], newOrigin[1]];
    },
    inverse(draft) {
      if (!capturedPrev) {
        throw new Error("originRebaseCommand.inverse called before apply");
      }
      const prev = capturedPrev;
      const dx = newOrigin[0] - prev[0];
      const dy = newOrigin[1] - prev[1];
      shiftAll(draft, dx, dy);
      draft.originOffset = [prev[0], prev[1]];
    },
  };
}
