// modify.extend — FR-005, FR-005a. Lengthen a target entity so its
// near endpoint moves to `targetPoint` (which lies on the target's
// supporting curve and was chosen by the tool — Quick or Classic).
//
// The command stores the prior endpoint(s) so inverse restores them.
import { castDraft, type Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface ExtendParams {
  id: Id;
  /** The point on the target's supporting curve to extend to. */
  targetPoint: Vec2;
  /** Which end of the target to move; the tool chose based on the
   *  endpoint nearest to the user's pick. */
  endpoint: "a" | "b" | "start" | "end";
}

export class UnsupportedExtendError extends Error {
  constructor(kind: string) {
    super(`modify.extend: unsupported entity kind "${kind}"`);
    this.name = "UnsupportedExtendError";
  }
}

export function extendCommand(params: ExtendParams): Command<ExtendParams> {
  let snapshot: Entity | null = null;
  return {
    name: "modify.extend",
    params,
    apply(draft: Draft<Drawing>) {
      const target = draft.entities[params.id];
      if (!target) return;
      if (!snapshot) snapshot = JSON.parse(JSON.stringify(target)) as Entity;
      const tp: Vec2 = [params.targetPoint[0], params.targetPoint[1]];
      switch (target.kind) {
        case "line":
          if (params.endpoint === "a") target.a = castDraft(tp);
          else if (params.endpoint === "b") target.b = castDraft(tp);
          else throw new UnsupportedExtendError("line:endpoint");
          return;
        case "arc": {
          const ang = Math.atan2(tp[1] - target.c[1], tp[0] - target.c[0]);
          if (params.endpoint === "start") target.startAngle = ang;
          else if (params.endpoint === "end") target.endAngle = ang;
          else throw new UnsupportedExtendError("arc:endpoint");
          return;
        }
        default:
          throw new UnsupportedExtendError(target.kind);
      }
    },
    inverse(draft: Draft<Drawing>) {
      if (snapshot) {
        draft.entities[params.id] = castDraft(snapshot);
      }
    },
  };
}
