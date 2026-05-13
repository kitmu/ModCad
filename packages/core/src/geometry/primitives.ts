// Bounding-box helpers for the Entity union. The spatial index
// (flatbush) consumes these directly; the dispatch on `kind` matches
// the discriminated union in scene/types.ts so the compiler enforces
// exhaustiveness.
//
// Polyline arc segments encode bulge per DXF (tan(included-angle/4)).
// Arc bbox handling tracks which axis extrema lie inside the sweep;
// the helpers here use the same sweep test for ARC and ELLIPSE
// entities so callers see a single consistent boundary.
import { fromPoint, fromPoints, union as bboxUnion } from "./Bbox.js";
import type { Bbox } from "./Bbox.js";
import type { Vec2 } from "./Vec2.js";
import type {
  ArcEntity,
  CircleEntity,
  EllipseEntity,
  Entity,
  LineEntity,
  PointEntity,
  PolylineEntity,
  PolylineVertex,
} from "../scene/types.js";

const TAU = Math.PI * 2;

/** Normalize an angle to [0, 2π). */
function normalizeAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/**
 * True when angle `theta` is swept by the arc going CCW from
 * `startAngle` to `endAngle`. Tolerates arbitrary signed inputs. A
 * sweep of 2π or more is treated as a full revolution — every angle
 * is in the sweep.
 */
function angleInSweep(theta: number, startAngle: number, endAngle: number): boolean {
  if (endAngle - startAngle >= TAU - 1e-12) return true;
  const s = normalizeAngle(startAngle);
  const e = normalizeAngle(endAngle);
  const t = normalizeAngle(theta);
  if (s <= e) return t >= s && t <= e;
  // Wraps across 0.
  return t >= s || t <= e;
}

export function bboxOfPoint(p: Vec2): Bbox {
  return fromPoint(p);
}

export function bboxOfLine(a: Vec2, b: Vec2): Bbox {
  return fromPoints([a, b]);
}

/** Bbox of a polyline ignoring bulge. For straight polylines this is
 *  exact; for bulged segments callers wanting tight bounds must
 *  expand each arc-bulged span — see {@link bboxOfPolylineArcAware}. */
export function bboxOfPolyline(vertices: readonly PolylineVertex[]): Bbox {
  return fromPoints(vertices.map((v) => v.p));
}

export function bboxOfCircle(c: Vec2, r: number): Bbox {
  const ar = Math.abs(r);
  return {
    minX: c[0] - ar,
    minY: c[1] - ar,
    maxX: c[0] + ar,
    maxY: c[1] + ar,
  };
}

/**
 * Tight bbox of an arc. Includes the two endpoints plus any of the
 * four axis extrema (E, N, W, S) that fall within the sweep.
 */
export function bboxOfArc(
  c: Vec2,
  r: number,
  startAngle: number,
  endAngle: number,
): Bbox {
  const ar = Math.abs(r);
  const start: Vec2 = [c[0] + ar * Math.cos(startAngle), c[1] + ar * Math.sin(startAngle)];
  const end: Vec2 = [c[0] + ar * Math.cos(endAngle), c[1] + ar * Math.sin(endAngle)];
  const points: Vec2[] = [start, end];
  // E, N, W, S extrema in CCW order.
  const extrema: Array<[number, Vec2]> = [
    [0, [c[0] + ar, c[1]]],
    [Math.PI / 2, [c[0], c[1] + ar]],
    [Math.PI, [c[0] - ar, c[1]]],
    [(3 * Math.PI) / 2, [c[0], c[1] - ar]],
  ];
  for (const [angle, pt] of extrema) {
    if (angleInSweep(angle, startAngle, endAngle)) points.push(pt);
  }
  return fromPoints(points);
}

/**
 * Bbox of a (possibly partial) ellipse. The principal axes of an
 * axis-aligned bounding box for a rotated ellipse are derived from
 * the implicit equation by setting d(x)/d(t) = 0; see e.g.
 * https://iquilezles.org/articles/ellipses/. Returns a tight box
 * over the [startParam, endParam] arc.
 */
export function bboxOfEllipse(
  c: Vec2,
  major: Vec2,
  ratio: number,
  startParam: number,
  endParam: number,
): Bbox {
  // Minor axis is major rotated 90° CCW, scaled by ratio.
  const minor: Vec2 = [-major[1] * ratio, major[0] * ratio];
  // Parametric point: P(t) = c + cos(t)*major + sin(t)*minor.
  const eval_ = (t: number): Vec2 => [
    c[0] + Math.cos(t) * major[0] + Math.sin(t) * minor[0],
    c[1] + Math.cos(t) * major[1] + Math.sin(t) * minor[1],
  ];
  // x extremum: dx/dt = -sin(t)*Mx + cos(t)*mx = 0 → tan(t) = mx/Mx.
  const tx = Math.atan2(minor[0], major[0]);
  // y extremum: dy/dt = -sin(t)*My + cos(t)*my = 0 → tan(t) = my/My.
  const ty = Math.atan2(minor[1], major[1]);
  const points: Vec2[] = [eval_(startParam), eval_(endParam)];
  for (const t of [tx, tx + Math.PI, ty, ty + Math.PI]) {
    if (angleInSweep(t, startParam, endParam)) points.push(eval_(t));
  }
  return fromPoints(points);
}

/**
 * Dispatch bbox computation for any Entity. Text and dimension
 * entities fall back to their anchor / styled-text reference points;
 * the renderer is the source of truth for their final on-screen
 * footprint and supplies its own padded extents.
 */
export function bboxOfEntity(entity: Entity): Bbox {
  switch (entity.kind) {
    case "line":
      return bboxOfLine((entity as LineEntity).a, (entity as LineEntity).b);
    case "polyline":
      return bboxOfPolyline((entity as PolylineEntity).vertices);
    case "circle":
      return bboxOfCircle((entity as CircleEntity).c, (entity as CircleEntity).r);
    case "arc": {
      const a = entity as ArcEntity;
      return bboxOfArc(a.c, a.r, a.startAngle, a.endAngle);
    }
    case "ellipse": {
      const e = entity as EllipseEntity;
      return bboxOfEllipse(e.c, e.major, e.ratio, e.startParam, e.endParam);
    }
    case "point":
      return bboxOfPoint((entity as PointEntity).p);
    case "text":
      // Renderer-provided extents land in a later pass; the kernel
      // box collapses to the anchor for spatial-index seeding.
      return fromPoint(entity.anchor);
    case "dimension":
      // Dimensions resolve through their referenced entities at draw
      // time; the kernel collapses to an empty box at the origin.
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    default: {
      const exhaustive: never = entity;
      throw new Error(`bboxOfEntity: unknown kind ${String((exhaustive as Entity).kind)}`);
    }
  }
}

/**
 * Re-export utility — convenient for callers that want to fold many
 * entity boxes together.
 */
export function bboxOfEntities(entities: readonly Entity[]): Bbox {
  if (entities.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let acc = bboxOfEntity(entities[0]!);
  for (let i = 1; i < entities.length; i++) {
    acc = bboxUnion(acc, bboxOfEntity(entities[i]!));
  }
  return acc;
}
