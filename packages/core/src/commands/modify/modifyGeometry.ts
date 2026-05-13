// modify.geometry — grip-drag commit. Edits a single named point on
// one entity (endpoint, midpoint, vertex, or center). Used by the
// grip system in apps/web; grip drags push a single command on
// pointerup so the operation participates in undo/redo cleanly.
//
// "Member" specs:
//   - Line:      "a" | "b" — endpoints. (Midpoint grips do not commit
//                via this command; midpoint drag of a line is a move
//                of both endpoints and goes through `moveCommand`.)
//   - Polyline:  { vertexIndex: n } — moves the n-th vertex.
//   - Circle:    "c" — center; "r" — radius (newValue is then a point
//                whose distance to the current center sets r).
//   - Arc:       "c" | "start" | "end" — center or endpoint angles.
//                Endpoint drag interprets newValue as a point on the
//                arc; the angle is recomputed from (newValue - center).
//   - Text:      "anchor".
import { castDraft, type Draft } from "immer";
import type { Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export type GeometryMember =
  | "a"
  | "b"
  | "c"
  | "r"
  | "start"
  | "end"
  | "anchor"
  | { vertexIndex: number };

export interface ModifyGeometryParams {
  entityId: Id;
  member: GeometryMember;
  newValue: Vec2;
}

export class InvalidGripTargetError extends Error {
  constructor(reason: string) {
    super(`modify.geometry: ${reason}`);
    this.name = "InvalidGripTargetError";
  }
}

export function modifyGeometryCommand(
  params: ModifyGeometryParams,
): Command<ModifyGeometryParams> {
  let snapshot: Entity | null = null;
  return {
    name: "modify.geometry",
    params,
    apply(draft: Draft<Drawing>) {
      const e = draft.entities[params.entityId];
      if (!e) return;
      snapshot ??= JSON.parse(JSON.stringify(e)) as Entity;
      const nv: Vec2 = [params.newValue[0], params.newValue[1]];
      const m = params.member;
      switch (e.kind) {
        case "line": {
          if (m === "a") e.a = castDraft(nv);
          else if (m === "b") e.b = castDraft(nv);
          else throw new InvalidGripTargetError(`line member ${String(m)}`);
          return;
        }
        case "polyline": {
          if (typeof m === "object" && "vertexIndex" in m) {
            const v = e.vertices[m.vertexIndex];
            if (v) v.p = castDraft(nv);
          } else {
            throw new InvalidGripTargetError(`polyline member ${String(m)}`);
          }
          return;
        }
        case "circle": {
          if (m === "c") e.c = castDraft(nv);
          else if (m === "r") {
            e.r = Math.hypot(nv[0] - e.c[0], nv[1] - e.c[1]);
          } else {
            throw new InvalidGripTargetError(`circle member ${String(m)}`);
          }
          return;
        }
        case "arc": {
          if (m === "c") e.c = castDraft(nv);
          else if (m === "start") {
            e.startAngle = Math.atan2(nv[1] - e.c[1], nv[0] - e.c[0]);
          } else if (m === "end") {
            e.endAngle = Math.atan2(nv[1] - e.c[1], nv[0] - e.c[0]);
          } else {
            throw new InvalidGripTargetError(`arc member ${String(m)}`);
          }
          return;
        }
        case "text": {
          if (m === "anchor") e.anchor = castDraft(nv);
          else throw new InvalidGripTargetError(`text member ${String(m)}`);
          return;
        }
        default:
          throw new InvalidGripTargetError(`unsupported entity kind ${e.kind}`);
      }
    },
    inverse(draft: Draft<Drawing>) {
      if (snapshot) draft.entities[params.entityId] = castDraft(snapshot);
    },
  };
}
