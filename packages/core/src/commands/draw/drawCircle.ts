// draw.circle — three construction modes per FR-001.
//
//   - center+radius: direct.
//   - 2 points: a/b are diameter endpoints; center = midpoint, r = half-distance.
//   - 3 points: circumcircle. Collinear input is rejected via orient2d
//     (Shewchuk-robust) so we never silently divide by ~0.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import { orient2d } from "../../geometry/predicates.js";
import type { Drawing, CircleEntity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface DrawCircleCenterRadiusParams {
  c: Vec2;
  r: number;
  layerId?: Id;
}

export interface DrawCircle2PointParams {
  a: Vec2;
  b: Vec2;
  layerId?: Id;
}

export interface DrawCircle3PointParams {
  a: Vec2;
  b: Vec2;
  c: Vec2;
  layerId?: Id;
}

export class CollinearError extends Error {
  constructor(message = "points are collinear; cannot construct circle") {
    super(message);
    this.name = "CollinearError";
  }
}

function makeCircleCommand(
  name: string,
  layerId: Id | undefined,
  c: Vec2,
  r: number,
  params: unknown,
): Command<unknown> {
  const id = newId();
  return {
    name,
    params,
    apply(draft: Draft<Drawing>) {
      const entity: CircleEntity = {
        id,
        kind: "circle",
        layerId: layerId ?? draft.currentLayerId,
        color: "byLayer",
        lineweight: "byLayer",
        c,
        r,
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

export function drawCircleCenterRadiusCommand(
  params: DrawCircleCenterRadiusParams,
): Command<DrawCircleCenterRadiusParams> {
  return makeCircleCommand(
    "draw.circle.centerRadius",
    params.layerId,
    params.c,
    params.r,
    params,
  ) as Command<DrawCircleCenterRadiusParams>;
}

export function drawCircle2PointCommand(
  params: DrawCircle2PointParams,
): Command<DrawCircle2PointParams> {
  const cx = (params.a[0] + params.b[0]) / 2;
  const cy = (params.a[1] + params.b[1]) / 2;
  const r = Math.hypot(params.b[0] - params.a[0], params.b[1] - params.a[1]) / 2;
  return makeCircleCommand(
    "draw.circle.twoPoint",
    params.layerId,
    [cx, cy],
    r,
    params,
  ) as Command<DrawCircle2PointParams>;
}

/**
 * Circumcenter via the classical perpendicular-bisector determinant.
 * Throws `CollinearError` when the three points are collinear (orient2d
 * exactly zero — Shewchuk-robust).
 */
export function drawCircle3PointCommand(
  params: DrawCircle3PointParams,
): Command<DrawCircle3PointParams> {
  const { a, b, c } = params;
  const o = orient2d(a[0], a[1], b[0], b[1], c[0], c[1]);
  if (o === 0) {
    throw new CollinearError();
  }
  // d = 2 * orient2d; circumcenter (ux, uy):
  //   ux = ((|a|^2)(by - cy) + (|b|^2)(cy - ay) + (|c|^2)(ay - by)) / d
  //   uy = ((|a|^2)(cx - bx) + (|b|^2)(ax - cx) + (|c|^2)(bx - ax)) / d
  const d = 2 * o;
  const a2 = a[0] * a[0] + a[1] * a[1];
  const b2 = b[0] * b[0] + b[1] * b[1];
  const c2 = c[0] * c[0] + c[1] * c[1];
  const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  const r = Math.hypot(a[0] - ux, a[1] - uy);
  return makeCircleCommand(
    "draw.circle.threePoint",
    params.layerId,
    [ux, uy],
    r,
    params,
  ) as Command<DrawCircle3PointParams>;
}
