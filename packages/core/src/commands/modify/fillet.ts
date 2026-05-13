// modify.fillet — FR-005. Round the corner between two lines with an
// arc of the given radius. v1 supports line/line only; line/arc and
// arc/arc are deferred.
//
// Strategy:
//   - Find the intersection point of the two supporting lines.
//   - For each line, compute the trimmed endpoint = corner ± r/tan(θ/2)
//     along the line direction toward the kept side.
//   - Insert an arc tangent to both lines.
//
// The tool chooses which side to keep on each line by passing
// `pickPointA` / `pickPointB` — the half-line on the same side as the
// pick is the surviving segment.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { ArcEntity, Drawing, LineEntity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface FilletParams {
  /** Two target entities (must currently be lines). */
  a: Id;
  b: Id;
  /** Fillet radius (> 0). */
  radius: number;
  /** Picks decide which half of each line to keep. */
  pickA: Vec2;
  pickB: Vec2;
}

export class UnsupportedFilletError extends Error {
  constructor(reason: string) {
    super(`modify.fillet: ${reason}`);
    this.name = "UnsupportedFilletError";
  }
}

function lineDir(l: LineEntity): { dir: Vec2; len: number } {
  const dx = l.b[0] - l.a[0];
  const dy = l.b[1] - l.a[1];
  const len = Math.hypot(dx, dy);
  return { dir: len === 0 ? [0, 0] : [dx / len, dy / len], len };
}

/** Intersection of two infinite lines; null if parallel. */
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

/** Choose the unit direction from `corner` toward `pickPoint`'s side of
 *  the line, snapping to one of {+dir, -dir}. */
function dirTowardPick(l: LineEntity, corner: Vec2, pick: Vec2): Vec2 {
  const { dir } = lineDir(l);
  const dotPick = (pick[0] - corner[0]) * dir[0] + (pick[1] - corner[1]) * dir[1];
  return dotPick >= 0 ? dir : [-dir[0], -dir[1]];
}

export function filletCommand(params: FilletParams): Command<FilletParams> {
  if (!(params.radius > 0)) {
    throw new UnsupportedFilletError(`radius must be > 0 (got ${params.radius})`);
  }
  let snapshotA: LineEntity | null = null;
  let snapshotB: LineEntity | null = null;
  const arcId: Id = newId();
  return {
    name: "modify.fillet",
    params,
    apply(draft: Draft<Drawing>) {
      const ea = draft.entities[params.a];
      const eb = draft.entities[params.b];
      if (!ea || !eb) return;
      if (ea.kind !== "line" || eb.kind !== "line") {
        throw new UnsupportedFilletError("v1 supports line/line only");
      }
      const la = ea as LineEntity;
      const lb = eb as LineEntity;
      const corner = lineIntersection(la, lb);
      if (!corner) {
        throw new UnsupportedFilletError("lines are parallel");
      }
      snapshotA ??= JSON.parse(JSON.stringify(la)) as LineEntity;
      snapshotB ??= JSON.parse(JSON.stringify(lb)) as LineEntity;
      const da = dirTowardPick(la, corner, params.pickA);
      const db = dirTowardPick(lb, corner, params.pickB);
      // Half-angle between the two kept half-lines.
      const cosTheta = da[0] * db[0] + da[1] * db[1];
      // Clamp to avoid NaN at ±1.
      const theta = Math.acos(Math.max(-1, Math.min(1, cosTheta)));
      const half = theta / 2;
      if (half <= 0 || half >= Math.PI / 2) {
        throw new UnsupportedFilletError("lines are collinear");
      }
      const setback = params.radius / Math.tan(half);
      const pa: Vec2 = [corner[0] + da[0] * setback, corner[1] + da[1] * setback];
      const pb: Vec2 = [corner[0] + db[0] * setback, corner[1] + db[1] * setback];
      // Arc center: corner + bisector * (r/sin(half)).
      const bx = da[0] + db[0];
      const by = da[1] + db[1];
      const blen = Math.hypot(bx, by);
      const bisector: Vec2 = blen === 0 ? [0, 0] : [bx / blen, by / blen];
      const dist = params.radius / Math.sin(half);
      const center: Vec2 = [
        corner[0] + bisector[0] * dist,
        corner[1] + bisector[1] * dist,
      ];
      const angA = Math.atan2(pa[1] - center[1], pa[0] - center[0]);
      const angB = Math.atan2(pb[1] - center[1], pb[0] - center[0]);
      // Adjust line endpoints — keep the side toward `pickA` / `pickB`.
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
      // Choose arc CCW direction so it goes from pa to pb on the
      // short side. Try (angA -> angB) and (angB -> angA): the one
      // with smaller sweep is the rounded corner.
      const sweepAtoB = ((angB - angA) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const arc: ArcEntity = {
        id: arcId,
        kind: "arc",
        layerId: la.layerId,
        color: la.color,
        lineweight: la.lineweight,
        c: center,
        r: params.radius,
        startAngle: sweepAtoB <= Math.PI ? angA : angB,
        endAngle: sweepAtoB <= Math.PI ? angB : angA,
      };
      draft.entities[arcId] = castDraft(arc);
      draft.entityOrder.push(arcId);
    },
    inverse(draft: Draft<Drawing>) {
      if (snapshotA) draft.entities[params.a] = castDraft(snapshotA);
      if (snapshotB) draft.entities[params.b] = castDraft(snapshotB);
      delete draft.entities[arcId];
      const idx = draft.entityOrder.indexOf(arcId);
      if (idx >= 0) draft.entityOrder.splice(idx, 1);
    },
  };
}
