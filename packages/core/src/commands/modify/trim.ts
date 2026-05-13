// modify.trim — FR-005, FR-005a. Cut a target entity at a point that
// lies on it, dropping the segment that contains `pickPoint` (Quick
// mode default: the segment under the cursor is removed; Classic mode
// passes the cut point already computed against chosen edges).
//
// The command takes the target id and:
//   - `cutPoints`: 1 or 2 points on the target where the cut occurs.
//   - `pickPoint`: which side to keep / drop (the side containing
//     pickPoint is dropped).
//
// Strategy: snapshot the target before the operation; replace with
// the trimmed version on apply; restore on inverse. We deliberately
// don't try to mutate in place — the trimmed shape may be a different
// kind (a line trimmed in the middle becomes two lines), so apply
// adds a fresh entity (or two) with new ids and inverse restores the
// original.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type {
  ArcEntity,
  CircleEntity,
  Drawing,
  Entity,
  LineEntity,
} from "../../scene/types.js";
import type { Command } from "../CommandBus.js";
import { arcParam } from "../../geometry/intersections.js";

export interface TrimParams {
  /** Target entity to trim. */
  id: Id;
  /** One or two cut points on the target. */
  cutPoints: ReadonlyArray<Vec2>;
  /** Point used to decide which side to drop. */
  pickPoint: Vec2;
}

export class UnsupportedTrimError extends Error {
  constructor(kind: string) {
    super(`modify.trim: unsupported entity kind "${kind}"`);
    this.name = "UnsupportedTrimError";
  }
}

interface TrimResult {
  /** Replacement entities (0..2). The original is removed. */
  replacements: Entity[];
}

function paramOnLine(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
}

function trimLine(
  e: LineEntity,
  cutPoints: ReadonlyArray<Vec2>,
  pickPoint: Vec2,
): TrimResult {
  const tPick = paramOnLine(pickPoint, e.a, e.b);
  if (cutPoints.length === 1) {
    const tCut = paramOnLine(cutPoints[0]!, e.a, e.b);
    // Drop the side that contains pickPoint.
    if (tPick < tCut) {
      // Keep [cut, b].
      return {
        replacements: [
          { ...e, id: newId(), a: [cutPoints[0]![0], cutPoints[0]![1]], b: e.b },
        ],
      };
    }
    return {
      replacements: [
        { ...e, id: newId(), a: e.a, b: [cutPoints[0]![0], cutPoints[0]![1]] },
      ],
    };
  }
  // Two cut points — sort by parameter; pickPoint lies between them
  // (Quick mode) or outside (Classic mode against two edges).
  const c0 = cutPoints[0]!;
  const c1 = cutPoints[1]!;
  const t0 = paramOnLine(c0, e.a, e.b);
  const t1 = paramOnLine(c1, e.a, e.b);
  const lo = t0 <= t1 ? c0 : c1;
  const hi = t0 <= t1 ? c1 : c0;
  const tLo = Math.min(t0, t1);
  const tHi = Math.max(t0, t1);
  if (tPick >= tLo && tPick <= tHi) {
    // Pick is between the two cuts: drop the middle, keep both ends.
    return {
      replacements: [
        { ...e, id: newId(), a: e.a, b: [lo[0], lo[1]] },
        { ...e, id: newId(), a: [hi[0], hi[1]], b: e.b },
      ],
    };
  }
  // Pick is outside the cut interval: drop the segment containing pick.
  if (tPick < tLo) {
    return {
      replacements: [
        { ...e, id: newId(), a: [lo[0], lo[1]], b: [hi[0], hi[1]] },
        { ...e, id: newId(), a: [hi[0], hi[1]], b: e.b },
      ],
    };
  }
  return {
    replacements: [
      { ...e, id: newId(), a: e.a, b: [lo[0], lo[1]] },
      { ...e, id: newId(), a: [lo[0], lo[1]], b: [hi[0], hi[1]] },
    ],
  };
}

function trimCircle(
  e: CircleEntity,
  cutPoints: ReadonlyArray<Vec2>,
  pickPoint: Vec2,
): TrimResult {
  if (cutPoints.length !== 2) {
    // A single cut on a circle leaves a full arc — degenerate; treat
    // as a no-op (caller already validated).
    return { replacements: [{ ...e, id: newId() }] };
  }
  const c0 = cutPoints[0]!;
  const c1 = cutPoints[1]!;
  const a0 = Math.atan2(c0[1] - e.c[1], c0[0] - e.c[0]);
  const a1 = Math.atan2(c1[1] - e.c[1], c1[0] - e.c[0]);
  const aPick = Math.atan2(pickPoint[1] - e.c[1], pickPoint[0] - e.c[0]);
  // Produce a single arc that *excludes* the side containing pickPoint.
  // Two candidate arcs: [a0 -> a1 CCW] and [a1 -> a0 CCW]. Keep the one
  // that does NOT sweep through aPick.
  const arc1: ArcEntity = {
    id: newId(),
    kind: "arc",
    layerId: e.layerId,
    color: e.color,
    lineweight: e.lineweight,
    c: e.c,
    r: e.r,
    startAngle: a0,
    endAngle: a1,
  };
  if (arcParam(arc1, [
    e.c[0] + e.r * Math.cos(aPick),
    e.c[1] + e.r * Math.sin(aPick),
  ]) !== null) {
    // Pick sweep is in arc1; keep arc2 instead.
    return {
      replacements: [
        {
          id: newId(),
          kind: "arc",
          layerId: e.layerId,
          color: e.color,
          lineweight: e.lineweight,
          c: e.c,
          r: e.r,
          startAngle: a1,
          endAngle: a0,
        },
      ],
    };
  }
  return { replacements: [arc1] };
}

function trimArc(
  e: ArcEntity,
  cutPoints: ReadonlyArray<Vec2>,
  pickPoint: Vec2,
): TrimResult {
  const arcEvalParam = (p: Vec2): number => {
    const v = arcParam(e, p);
    return v ?? 0;
  };
  const tPick = arcEvalParam(pickPoint);
  if (cutPoints.length === 1) {
    const tCut = arcEvalParam(cutPoints[0]!);
    const cutAngle = Math.atan2(
      cutPoints[0]![1] - e.c[1],
      cutPoints[0]![0] - e.c[0],
    );
    if (tPick < tCut) {
      // Keep cut -> endAngle.
      return {
        replacements: [{ ...e, id: newId(), startAngle: cutAngle }],
      };
    }
    return {
      replacements: [{ ...e, id: newId(), endAngle: cutAngle }],
    };
  }
  const t0 = arcEvalParam(cutPoints[0]!);
  const t1 = arcEvalParam(cutPoints[1]!);
  const lo = t0 <= t1 ? 0 : 1;
  const hi = t0 <= t1 ? 1 : 0;
  const ang = (p: Vec2): number => Math.atan2(p[1] - e.c[1], p[0] - e.c[0]);
  const aLo = ang(cutPoints[lo]!);
  const aHi = ang(cutPoints[hi]!);
  const tLo = Math.min(t0, t1);
  const tHi = Math.max(t0, t1);
  if (tPick >= tLo && tPick <= tHi) {
    // Drop middle.
    return {
      replacements: [
        { ...e, id: newId(), startAngle: e.startAngle, endAngle: aLo },
        { ...e, id: newId(), startAngle: aHi, endAngle: e.endAngle },
      ],
    };
  }
  // Pick outside the interval — drop one end.
  if (tPick < tLo) {
    return {
      replacements: [{ ...e, id: newId(), startAngle: aLo, endAngle: e.endAngle }],
    };
  }
  return {
    replacements: [{ ...e, id: newId(), startAngle: e.startAngle, endAngle: aHi }],
  };
}

function computeTrim(
  e: Entity,
  cutPoints: ReadonlyArray<Vec2>,
  pickPoint: Vec2,
): TrimResult {
  switch (e.kind) {
    case "line":
      return trimLine(e, cutPoints, pickPoint);
    case "circle":
      return trimCircle(e, cutPoints, pickPoint);
    case "arc":
      return trimArc(e, cutPoints, pickPoint);
    default:
      throw new UnsupportedTrimError(e.kind);
  }
}

export function trimCommand(params: TrimParams): Command<TrimParams> {
  let snapshot: Entity | null = null;
  let snapshotIndex = -1;
  let replacementIds: Id[] = [];
  return {
    name: "modify.trim",
    params,
    apply(draft: Draft<Drawing>) {
      const target = draft.entities[params.id];
      if (!target) return;
      if (!snapshot) {
        snapshot = JSON.parse(JSON.stringify(target)) as Entity;
        snapshotIndex = draft.entityOrder.indexOf(params.id);
      }
      const result = computeTrim(snapshot, params.cutPoints, params.pickPoint);
      // Remove the original.
      delete draft.entities[params.id];
      const idx = draft.entityOrder.indexOf(params.id);
      if (idx >= 0) draft.entityOrder.splice(idx, 1);
      // Reuse pre-allocated ids on redo so the selection state is stable.
      if (replacementIds.length === 0) {
        replacementIds = result.replacements.map((r) => r.id);
      } else {
        result.replacements.forEach((r, i) => {
          r.id = replacementIds[i]!;
        });
      }
      for (const r of result.replacements) {
        draft.entities[r.id] = castDraft(r);
        draft.entityOrder.push(r.id);
      }
    },
    inverse(draft: Draft<Drawing>) {
      for (const id of replacementIds) {
        delete draft.entities[id];
        const idx = draft.entityOrder.indexOf(id);
        if (idx >= 0) draft.entityOrder.splice(idx, 1);
      }
      if (snapshot) {
        draft.entities[params.id] = castDraft(snapshot);
        if (snapshotIndex >= 0) {
          draft.entityOrder.splice(snapshotIndex, 0, params.id);
        } else {
          draft.entityOrder.push(params.id);
        }
      }
    },
  };
}
