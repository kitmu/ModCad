// modify.rotate — FR-005. Rotate every entity in `ids` by `angle`
// (radians, CCW) about `pivot`.
//
// The pivot stays fixed. For circles/ellipses we rotate the center
// point and the orientation parameters (arc startAngle/endAngle,
// ellipse major axis). For text we rotate the anchor and add to the
// stored rotation. Inverse is the negative angle.
import { castDraft, type Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface RotateParams {
  ids: ReadonlyArray<Id>;
  pivot: Vec2;
  /** Radians, CCW. */
  angle: number;
}

function rotatePoint(p: Vec2, pivot: Vec2, cos: number, sin: number): Vec2 {
  const dx = p[0] - pivot[0];
  const dy = p[1] - pivot[1];
  return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos];
}

function rotateVec(v: Vec2, cos: number, sin: number): Vec2 {
  return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos];
}

function rotateEntity(
  e: Draft<Entity>,
  pivot: Vec2,
  angle: number,
  cos: number,
  sin: number,
): void {
  switch (e.kind) {
    case "line":
      e.a = castDraft(rotatePoint(e.a, pivot, cos, sin));
      e.b = castDraft(rotatePoint(e.b, pivot, cos, sin));
      return;
    case "polyline":
      for (const v of e.vertices) v.p = castDraft(rotatePoint(v.p, pivot, cos, sin));
      return;
    case "circle":
      e.c = castDraft(rotatePoint(e.c, pivot, cos, sin));
      return;
    case "arc":
      e.c = castDraft(rotatePoint(e.c, pivot, cos, sin));
      e.startAngle = e.startAngle + angle;
      e.endAngle = e.endAngle + angle;
      return;
    case "ellipse":
      e.c = castDraft(rotatePoint(e.c, pivot, cos, sin));
      e.major = castDraft(rotateVec(e.major, cos, sin));
      return;
    case "point":
      e.p = castDraft(rotatePoint(e.p, pivot, cos, sin));
      return;
    case "text":
      e.anchor = castDraft(rotatePoint(e.anchor, pivot, cos, sin));
      e.rotation = e.rotation + angle;
      return;
    case "dimension":
      return;
    default: {
      const _exhaustive: never = e;
      throw new Error(
        `modify.rotate: unsupported kind ${String((_exhaustive as Entity).kind)}`,
      );
    }
  }
}

export function rotateCommand(params: RotateParams): Command<RotateParams> {
  const ids = [...params.ids];
  const pivot: Vec2 = [params.pivot[0], params.pivot[1]];
  const angle = params.angle;
  return {
    name: "modify.rotate",
    params,
    apply(draft: Draft<Drawing>) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const id of ids) {
        const e = draft.entities[id];
        if (e) rotateEntity(e, pivot, angle, cos, sin);
      }
    },
    inverse(draft: Draft<Drawing>) {
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      for (const id of ids) {
        const e = draft.entities[id];
        if (e) rotateEntity(e, pivot, -angle, cos, sin);
      }
    },
  };
}
