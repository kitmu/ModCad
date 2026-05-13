// Midpoint snap — line midpoint, arc midpoint (angular midpoint along
// the arc sweep), polyline segment midpoints.
import type { Vec2 } from "../../geometry/Vec2.js";
import { distance } from "../../geometry/Vec2.js";
import type { Entity } from "../../scene/types.js";
import type { SnapCandidate } from "./types.js";

export function midpoint(cursor: Vec2, entity: Entity): SnapCandidate[] {
  switch (entity.kind) {
    case "line":
      return [makeMid(cursor, entity.id, mid(entity.a, entity.b))];
    case "polyline": {
      // Midpoint of every straight segment. Curved (bulge != 0) segments
      // are TODO until geometry/primitives lands.
      const out: SnapCandidate[] = [];
      const verts = entity.vertices;
      for (let i = 0; i < verts.length - 1; i++) {
        out.push(makeMid(cursor, entity.id, mid(verts[i]!.p, verts[i + 1]!.p)));
      }
      if (entity.closed && verts.length > 1) {
        out.push(
          makeMid(
            cursor,
            entity.id,
            mid(verts[verts.length - 1]!.p, verts[0]!.p),
          ),
        );
      }
      return out;
    }
    case "arc": {
      const mid = (entity.startAngle + entity.endAngle) * 0.5;
      const p: Vec2 = [
        entity.c[0] + entity.r * Math.cos(mid),
        entity.c[1] + entity.r * Math.sin(mid),
      ];
      return [makeMid(cursor, entity.id, p)];
    }
    default:
      return [];
  }
}

function mid(a: Vec2, b: Vec2): Vec2 {
  return [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
}

function makeMid(cursor: Vec2, entityId: Entity["id"], p: Vec2): SnapCandidate {
  return {
    point: p,
    mode: "midpoint",
    strength: "hard",
    source: { entityId, ref: { kind: "midpoint" } },
    distancePx: distance(cursor, p),
    rank: 0,
  };
}
