// modify.scale — FR-005. Uniform scale about `pivot` by `factor`.
//
// v1 supports uniform scale only (non-uniform breaks circle/arc
// invariants without conversion to ellipse, deferred).
import { castDraft, type Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface ScaleParams {
  ids: ReadonlyArray<Id>;
  pivot: Vec2;
  factor: number;
}

export class InvalidScaleFactorError extends Error {
  constructor(factor: number) {
    super(`modify.scale: factor must be finite and non-zero (got ${factor})`);
    this.name = "InvalidScaleFactorError";
  }
}

function scalePoint(p: Vec2, pivot: Vec2, k: number): Vec2 {
  return [pivot[0] + (p[0] - pivot[0]) * k, pivot[1] + (p[1] - pivot[1]) * k];
}

function scaleEntity(e: Draft<Entity>, pivot: Vec2, k: number): void {
  switch (e.kind) {
    case "line":
      e.a = castDraft(scalePoint(e.a, pivot, k));
      e.b = castDraft(scalePoint(e.b, pivot, k));
      return;
    case "polyline":
      for (const v of e.vertices) v.p = castDraft(scalePoint(v.p, pivot, k));
      return;
    case "circle":
      e.c = castDraft(scalePoint(e.c, pivot, k));
      e.r = e.r * Math.abs(k);
      return;
    case "arc":
      e.c = castDraft(scalePoint(e.c, pivot, k));
      e.r = e.r * Math.abs(k);
      return;
    case "ellipse":
      e.c = castDraft(scalePoint(e.c, pivot, k));
      e.major = castDraft<Vec2>([e.major[0] * k, e.major[1] * k]);
      return;
    case "point":
      e.p = castDraft(scalePoint(e.p, pivot, k));
      return;
    case "text":
      e.anchor = castDraft(scalePoint(e.anchor, pivot, k));
      e.height = e.height * Math.abs(k);
      return;
    case "dimension":
      return;
    default: {
      const _exhaustive: never = e;
      throw new Error(
        `modify.scale: unsupported kind ${String((_exhaustive as Entity).kind)}`,
      );
    }
  }
}

export function scaleCommand(params: ScaleParams): Command<ScaleParams> {
  if (!Number.isFinite(params.factor) || params.factor === 0) {
    throw new InvalidScaleFactorError(params.factor);
  }
  const ids = [...params.ids];
  const pivot: Vec2 = [params.pivot[0], params.pivot[1]];
  const k = params.factor;
  const inv = 1 / k;
  return {
    name: "modify.scale",
    params,
    apply(draft: Draft<Drawing>) {
      for (const id of ids) {
        const e = draft.entities[id];
        if (e) scaleEntity(e, pivot, k);
      }
    },
    inverse(draft: Draft<Drawing>) {
      for (const id of ids) {
        const e = draft.entities[id];
        if (e) scaleEntity(e, pivot, inv);
      }
    },
  };
}
