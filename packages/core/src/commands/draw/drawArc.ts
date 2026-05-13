// draw.arc — FR-001. Two construction modes:
//
//   - center + start + end points (with explicit ccw flag).
//   - 3 points on the arc (start, through, end). Center is the
//     circumcenter; the start/end angles are derived from the
//     vectors to start and end points; orientation (ccw) is decided
//     by orient2d on (start, through, end).
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import { orient2d } from "../../geometry/predicates.js";
import type { Drawing, ArcEntity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { CollinearError } from "./drawCircle.js";

export interface DrawArcCenterEndsParams {
  c: Vec2;
  start: Vec2;
  end: Vec2;
  ccw?: boolean;
  layerId?: Id;
}

export interface DrawArc3PointParams {
  a: Vec2;
  b: Vec2;
  c: Vec2;
  layerId?: Id;
}

function makeArcCommand(
  name: string,
  layerId: Id | undefined,
  c: Vec2,
  r: number,
  startAngle: number,
  endAngle: number,
  params: unknown,
): Command<unknown> {
  const id = newId();
  return {
    name,
    params,
    apply(draft: Draft<Drawing>) {
      const entity: ArcEntity = {
        id,
        kind: "arc",
        layerId: layerId ?? draft.currentLayerId,
        color: "byLayer",
        lineweight: "byLayer",
        c,
        r,
        startAngle,
        endAngle,
      };
      draft.entities[id] = castDraft(entity);
      draft.entityOrder.push(id);
    },
    inverse(draft: Draft<Drawing>) {
      delete draft.entities[id];
      const i = draft.entityOrder.indexOf(id);
      if (i >= 0) draft.entityOrder.splice(i, 1);
    },
  };
}

export function drawArcCenterEndsCommand(
  params: DrawArcCenterEndsParams,
): Command<DrawArcCenterEndsParams> {
  const r = Math.hypot(params.start[0] - params.c[0], params.start[1] - params.c[1]);
  const startAngle = Math.atan2(params.start[1] - params.c[1], params.start[0] - params.c[0]);
  let endAngle = Math.atan2(params.end[1] - params.c[1], params.end[0] - params.c[0]);
  const ccw = params.ccw ?? true;
  // Normalize so the sweep direction matches ccw: when ccw, ensure
  // endAngle > startAngle; when cw, ensure endAngle < startAngle.
  // ArcEntity stores raw radians; the renderer interprets them as
  // signed sweep, so the test is just "is the sweep on the right side?".
  if (ccw) {
    while (endAngle <= startAngle) endAngle += 2 * Math.PI;
  } else {
    while (endAngle >= startAngle) endAngle -= 2 * Math.PI;
  }
  return makeArcCommand(
    "draw.arc.centerEnds",
    params.layerId,
    params.c,
    r,
    startAngle,
    endAngle,
    params,
  ) as Command<DrawArcCenterEndsParams>;
}

export function drawArc3PointCommand(
  params: DrawArc3PointParams,
): Command<DrawArc3PointParams> {
  const { a, b, c } = params;
  const o = orient2d(a[0], a[1], b[0], b[1], c[0], c[1]);
  if (o === 0) {
    throw new CollinearError("arc: three points are collinear");
  }
  const d = 2 * o;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  const center: Vec2 = [ux, uy];
  const r = Math.hypot(a[0] - ux, a[1] - uy);
  const startAngle = Math.atan2(a[1] - uy, a[0] - ux);
  let endAngle = Math.atan2(c[1] - uy, c[0] - ux);
  // This codebase's orient2d returns NEGATIVE when (a, b, c) is ccw
  // (it computes -1 × the conventional cross product; see the
  // canonical test triangle (0,0)→(1,0)→(0,1) which yields -1). So
  // the arc traverses ccw when `o < 0`.
  const ccw = o < 0;
  if (ccw) {
    while (endAngle <= startAngle) endAngle += 2 * Math.PI;
  } else {
    while (endAngle >= startAngle) endAngle -= 2 * Math.PI;
  }
  return makeArcCommand(
    "draw.arc.threePoint",
    params.layerId,
    center,
    r,
    startAngle,
    endAngle,
    params,
  ) as Command<DrawArc3PointParams>;
}
