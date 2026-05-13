// Node snap — POINT entities (FR-001 PDMODE-equivalent) and explicit
// polyline vertices. The mode is "node" rather than "vertex" to match
// AutoCAD's NODE/PDMODE convention.
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance } from "../../geometry/Vec2.js";
import type { Entity } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function node(cursor: Vec2, entity: Entity): SnapCandidate[] {
  switch (entity.kind) {
    case "point":
      return [
        {
          point: entity.p,
          mode: "node",
          strength: "hard",
          // Points have no per-point ref — they are themselves the node.
          source: { entityId: entity.id, ref: { kind: "computed" } },
          distancePx: distance(cursor, entity.p),
          rank: 0,
        },
      ];
    case "polyline":
      return entity.vertices.map((v, index) => ({
        point: v.p,
        mode: "node",
        strength: "hard" as const,
        source: { entityId: entity.id, ref: { kind: "vertex", index } },
        distancePx: distance(cursor, v.p),
        rank: 0,
      }));
    default:
      return [];
  }
}
