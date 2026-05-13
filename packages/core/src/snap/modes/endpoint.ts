// Endpoint snap — line endpoints, polyline first/last vertices,
// arc start/end. Returns one candidate per endpoint (the engine picks
// the closest after radius gating).
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance } from "../../geometry/Vec2.js";
import type { Entity } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function endpoint(cursor: Vec2, entity: Entity): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  switch (entity.kind) {
    case "line": {
      out.push(makeEndpoint(cursor, entity.id, entity.a, 0));
      out.push(makeEndpoint(cursor, entity.id, entity.b, 1));
      return out;
    }
    case "polyline": {
      if (entity.closed || entity.vertices.length === 0) return out;
      const last = entity.vertices.length - 1;
      out.push(makeEndpoint(cursor, entity.id, entity.vertices[0]!.p, 0));
      out.push(makeEndpoint(cursor, entity.id, entity.vertices[last]!.p, 1));
      return out;
    }
    case "arc": {
      const start: Vec2 = [
        entity.c[0] + entity.r * Math.cos(entity.startAngle),
        entity.c[1] + entity.r * Math.sin(entity.startAngle),
      ];
      const end: Vec2 = [
        entity.c[0] + entity.r * Math.cos(entity.endAngle),
        entity.c[1] + entity.r * Math.sin(entity.endAngle),
      ];
      out.push(makeEndpoint(cursor, entity.id, start, 0));
      out.push(makeEndpoint(cursor, entity.id, end, 1));
      return out;
    }
    default:
      return out;
  }
}

function makeEndpoint(
  cursor: Vec2,
  entityId: Entity["id"],
  p: Vec2,
  index: 0 | 1,
): SnapCandidate {
  return {
    point: p,
    mode: "endpoint",
    strength: "hard",
    source: { entityId, ref: { kind: "endpoint", index } },
    distancePx: distance(cursor, p),
    rank: 0,
  };
}
