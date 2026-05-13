// draw.rectangle — FR-001. Stored as a closed 4-vertex polyline so the
// kernel doesn't need a separate rectangle type; DXF round-tripping and
// modify commands then treat it uniformly with any other polyline.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type {
  Drawing,
  PolylineEntity,
  PolylineVertex,
} from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface DrawRectangleParams {
  a: Vec2;
  b: Vec2;
  layerId?: Id;
}

export function drawRectangleCommand(
  params: DrawRectangleParams,
): Command<DrawRectangleParams> {
  const id = newId();
  const [ax, ay] = params.a;
  const [bx, by] = params.b;
  const vertices: PolylineVertex[] = [
    { p: [ax, ay], bulge: 0 },
    { p: [bx, ay], bulge: 0 },
    { p: [bx, by], bulge: 0 },
    { p: [ax, by], bulge: 0 },
  ];
  return {
    name: "draw.rectangle",
    params,
    apply(draft: Draft<Drawing>) {
      const entity: PolylineEntity = {
        id,
        kind: "polyline",
        layerId: params.layerId ?? draft.currentLayerId,
        color: "byLayer",
        lineweight: "byLayer",
        // Fresh array on every apply so redo doesn't share a frozen ref.
        vertices: vertices.map((v) => ({ p: v.p, bulge: v.bulge })),
        closed: true,
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
