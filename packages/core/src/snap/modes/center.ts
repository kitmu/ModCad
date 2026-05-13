// Center snap — circle / arc / ellipse center point.
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance } from "../../geometry/Vec2.js";
import type { Entity } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function center(cursor: Vec2, entity: Entity): SnapCandidate | null {
  if (entity.kind !== "circle" && entity.kind !== "arc" && entity.kind !== "ellipse") {
    return null;
  }
  return {
    point: entity.c,
    mode: "center",
    strength: "hard",
    source: { entityId: entity.id, ref: { kind: "center" } },
    distancePx: distance(cursor, entity.c),
    rank: 0,
  };
}
