// modify.chamfer — FR-005. Cut the corner between two lines with a
// straight bevel of equal distances `distance` along each line from
// the intersection. v1 supports line/line only.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, LineEntity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface ChamferParams {
  a: Id;
  b: Id;
  distance: number;
  pickA: Vec2;
  pickB: Vec2;
}

export class UnsupportedChamferError extends Error {
  constructor(reason: string) {
    super(`modify.chamfer: ${reason}`);
    this.name = "UnsupportedChamferError";
  }
}

function lineDir(l: LineEntity): Vec2 {
  const dx = l.b[0] - l.a[0];
  const dy = l.b[1] - l.a[1];
  const len = Math.hypot(dx, dy);
  return len === 0 ? [0, 0] : [dx / len, dy / len];
}

function lineIntersection(la: LineEntity, lb: LineEntity): Vec2 | null {
  const x1 = la.a[0];
  const y1 = la.a[1];
  const x2 = la.b[0];
  const y2 = la.b[1];
  const x3 = lb.a[0];
  const y3 = lb.a[1];
  const x4 = lb.b[0];
  const y4 = lb.b[1];
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function dirTowardPick(l: LineEntity, corner: Vec2, pick: Vec2): Vec2 {
  const dir = lineDir(l);
  const dotPick = (pick[0] - corner[0]) * dir[0] + (pick[1] - corner[1]) * dir[1];
  return dotPick >= 0 ? dir : [-dir[0], -dir[1]];
}

export function chamferCommand(params: ChamferParams): Command<ChamferParams> {
  if (!(params.distance > 0)) {
    throw new UnsupportedChamferError(
      `distance must be > 0 (got ${params.distance})`,
    );
  }
  let snapshotA: LineEntity | null = null;
  let snapshotB: LineEntity | null = null;
  const bevelId: Id = newId();
  return {
    name: "modify.chamfer",
    params,
    apply(draft: Draft<Drawing>) {
      const ea = draft.entities[params.a];
      const eb = draft.entities[params.b];
      if (!ea || !eb) return;
      if (ea.kind !== "line" || eb.kind !== "line") {
        throw new UnsupportedChamferError("v1 supports line/line only");
      }
      const la = ea as LineEntity;
      const lb = eb as LineEntity;
      const corner = lineIntersection(la, lb);
      if (!corner) {
        throw new UnsupportedChamferError("lines are parallel");
      }
      snapshotA ??= JSON.parse(JSON.stringify(la)) as LineEntity;
      snapshotB ??= JSON.parse(JSON.stringify(lb)) as LineEntity;
      const da = dirTowardPick(la, corner, params.pickA);
      const db = dirTowardPick(lb, corner, params.pickB);
      const pa: Vec2 = [
        corner[0] + da[0] * params.distance,
        corner[1] + da[1] * params.distance,
      ];
      const pb: Vec2 = [
        corner[0] + db[0] * params.distance,
        corner[1] + db[1] * params.distance,
      ];
      const adjust = (l: LineEntity, kept: Vec2, pick: Vec2): void => {
        const distFromA = Math.hypot(pick[0] - l.a[0], pick[1] - l.a[1]);
        const distFromB = Math.hypot(pick[0] - l.b[0], pick[1] - l.b[1]);
        if (distFromA < distFromB) {
          l.b = kept;
        } else {
          l.a = kept;
        }
      };
      adjust(la, pa, params.pickA);
      adjust(lb, pb, params.pickB);
      const bevel: LineEntity = {
        id: bevelId,
        kind: "line",
        layerId: la.layerId,
        color: la.color,
        lineweight: la.lineweight,
        a: pa,
        b: pb,
      };
      draft.entities[bevelId] = castDraft(bevel);
      draft.entityOrder.push(bevelId);
    },
    inverse(draft: Draft<Drawing>) {
      if (snapshotA) draft.entities[params.a] = castDraft(snapshotA);
      if (snapshotB) draft.entities[params.b] = castDraft(snapshotB);
      delete draft.entities[bevelId];
      const idx = draft.entityOrder.indexOf(bevelId);
      if (idx >= 0) draft.entityOrder.splice(idx, 1);
    },
  };
}
