// Grid snap — round the cursor to the nearest grid intersection. Has
// no source entity; the source.entityId field is filled with a sentinel
// asId("") and the ref is "computed".
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance } from "../../geometry/Vec2.js";
import { asId } from "../../ids.js";
import type { SnapCandidate } from "./types.js";

const GRID_SOURCE = asId("");

export function grid(cursor: Vec2, spacing: Vec2): SnapCandidate | null {
  if (spacing[0] <= 0 || spacing[1] <= 0) return null;
  const gx = Math.round(cursor[0] / spacing[0]) * spacing[0];
  const gy = Math.round(cursor[1] / spacing[1]) * spacing[1];
  const p: Vec2 = [gx, gy];
  return {
    point: p,
    mode: "grid",
    strength: "hard",
    source: { entityId: GRID_SOURCE, ref: { kind: "computed" } },
    distancePx: distance(cursor, p),
    rank: 0,
  };
}
