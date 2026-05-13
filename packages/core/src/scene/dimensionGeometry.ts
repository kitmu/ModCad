// T082 — Dimension geometry resolution.
//
// Given a DimensionEntity (which carries variant + refs + offset +
// styleId), resolve the concrete world-space geometry the renderer
// needs to draw it: the dimension line, the two extension lines, the
// text-anchor point, and the measured value string. This is the single
// source of truth for "what does dim X look like right now"; callers
// (renderer, command-state panel, dev API) all funnel through here.
//
// Pure: no immer drafts, no side effects. The only inputs are the
// current Drawing snapshot and a dimension id.
import type { Id } from "../ids.js";
import type { Vec2 } from "../geometry/Vec2.js";
import { distance, sub, length, normalize } from "../geometry/Vec2.js";
import type {
  ArcEntity,
  CircleEntity,
  DimensionEntity,
  Drawing,
  EllipseEntity,
  Entity,
  EntityPointRef,
  EntityPointRefKind,
  LineEntity,
  PolylineEntity,
} from "./types.js";
import { getDimensionStyle, type DimensionStyle } from "./dimensionStyle.js";

export interface DimensionGeometry {
  /** Dimension line endpoints. */
  dimLine: { a: Vec2; b: Vec2 };
  /** Two extension-line spans (from the referenced geometry to dimLine). */
  extLines: ReadonlyArray<{ a: Vec2; b: Vec2 }>;
  /** Anchor for the value text. */
  textPosition: Vec2;
  /** Stringified measurement, formatted per style precision. */
  value: string;
  /** Numeric measurement (the value before string formatting). */
  numericValue: number;
  /** Style record used to render. */
  style: DimensionStyle;
}

/**
 * Resolve an `EntityPointRef` against the live Drawing snapshot.
 * Returns null if the referenced entity has been deleted or its
 * ref-kind doesn't match the entity's shape.
 */
export function resolveEntityPoint(
  d: Drawing,
  ref: EntityPointRef,
): Vec2 | null {
  const e = d.entities[ref.entityId];
  if (!e) return null;
  return pointFromKind(e, ref.point);
}

function pointFromKind(e: Entity, kind: EntityPointRefKind): Vec2 | null {
  switch (kind.kind) {
    case "endpoint":
      if (e.kind === "line") {
        return kind.index === 0 ? (e as LineEntity).a : (e as LineEntity).b;
      }
      if (e.kind === "polyline") {
        const verts = (e as PolylineEntity).vertices;
        if (verts.length === 0) return null;
        return kind.index === 0 ? verts[0]!.p : verts[verts.length - 1]!.p;
      }
      if (e.kind === "arc") {
        const a = e as ArcEntity;
        const ang = kind.index === 0 ? a.startAngle : a.endAngle;
        return [a.c[0] + a.r * Math.cos(ang), a.c[1] + a.r * Math.sin(ang)];
      }
      return null;
    case "midpoint":
      if (e.kind === "line") {
        const l = e as LineEntity;
        return [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
      }
      return null;
    case "vertex":
      if (e.kind === "polyline") {
        const v = (e as PolylineEntity).vertices[kind.index];
        return v ? v.p : null;
      }
      return null;
    case "center":
      if (e.kind === "circle") return (e as CircleEntity).c;
      if (e.kind === "arc") return (e as ArcEntity).c;
      if (e.kind === "ellipse") return (e as EllipseEntity).c;
      return null;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`pointFromKind: unknown kind ${String((_exhaustive as EntityPointRefKind).kind)}`);
    }
  }
}

function resolvePointOrLiteral(d: Drawing, p: Vec2 | EntityPointRef): Vec2 | null {
  if (Array.isArray(p) && p.length === 2 && typeof p[0] === "number") {
    return p as Vec2;
  }
  return resolveEntityPoint(d, p as EntityPointRef);
}

/** Format a numeric value per a dimension style. */
export function formatDimensionValue(v: number, style: DimensionStyle): string {
  const abs = Math.abs(v);
  let s = abs.toFixed(style.precision);
  if (style.suppressZeros && s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return v < 0 ? `-${s}` : s;
}

/**
 * Resolve the renderer-ready geometry for `dimensionId`. Returns null
 * when the dimension's references can't be resolved (e.g. an endpoint
 * pointing at a deleted entity); the renderer treats that as "skip".
 */
export function recomputeDimensionGeometry(
  d: Drawing,
  dimensionId: Id,
): DimensionGeometry | null {
  const ent = d.entities[dimensionId];
  if (!ent || ent.kind !== "dimension") return null;
  const dim = ent as DimensionEntity;
  const style = getDimensionStyle(d, dim.styleId);

  switch (dim.refs.variant) {
    case "aligned": {
      const a = resolvePointOrLiteral(d, dim.refs.a);
      const b = resolvePointOrLiteral(d, dim.refs.b);
      if (a === null || b === null) return null;
      // Offset is perpendicular to AB.
      const dir = normalize(sub(b, a));
      // Perpendicular (left-hand): (-dy, dx).
      const perp: Vec2 = [-dir[1], dir[0]];
      const off = dim.offset;
      const dimA: Vec2 = [a[0] + perp[0] * off, a[1] + perp[1] * off];
      const dimB: Vec2 = [b[0] + perp[0] * off, b[1] + perp[1] * off];
      const numericValue = distance(a, b);
      const extLines = [
        { a, b: dimA },
        { a: b, b: dimB },
      ];
      const textPosition: Vec2 = [(dimA[0] + dimB[0]) / 2, (dimA[1] + dimB[1]) / 2];
      return {
        dimLine: { a: dimA, b: dimB },
        extLines,
        textPosition,
        value: formatDimensionValue(numericValue, style),
        numericValue,
        style,
      };
    }
    case "linear": {
      const a = resolvePointOrLiteral(d, dim.refs.a);
      const b = resolvePointOrLiteral(d, dim.refs.b);
      if (a === null || b === null) return null;
      const axis = dim.refs.axis;
      const off = dim.offset;
      // Project both points onto axis; dim line is parallel to axis at
      // the offset distance from the higher-magnitude side.
      let dimA: Vec2;
      let dimB: Vec2;
      let numericValue: number;
      if (axis === "x") {
        const y = Math.max(a[1], b[1]) + off;
        dimA = [a[0], y];
        dimB = [b[0], y];
        numericValue = Math.abs(b[0] - a[0]);
      } else {
        const x = Math.max(a[0], b[0]) + off;
        dimA = [x, a[1]];
        dimB = [x, b[1]];
        numericValue = Math.abs(b[1] - a[1]);
      }
      const extLines = [
        { a, b: dimA },
        { a: b, b: dimB },
      ];
      const textPosition: Vec2 = [(dimA[0] + dimB[0]) / 2, (dimA[1] + dimB[1]) / 2];
      return {
        dimLine: { a: dimA, b: dimB },
        extLines,
        textPosition,
        value: formatDimensionValue(numericValue, style),
        numericValue,
        style,
      };
    }
    case "angular": {
      const v = dim.refs.v;
      const a = resolvePointOrLiteral(d, dim.refs.a);
      const b = resolvePointOrLiteral(d, dim.refs.b);
      if (a === null || b === null) return null;
      const va = sub(a, v);
      const vb = sub(b, v);
      const la = length(va);
      const lb = length(vb);
      if (la === 0 || lb === 0) return null;
      const angleA = Math.atan2(va[1], va[0]);
      const angleB = Math.atan2(vb[1], vb[0]);
      let sweep = angleB - angleA;
      // Normalize to (-pi, pi].
      while (sweep <= -Math.PI) sweep += Math.PI * 2;
      while (sweep > Math.PI) sweep -= Math.PI * 2;
      const numericValue = Math.abs((sweep * 180) / Math.PI);
      const r = dim.offset;
      const midAng = angleA + sweep / 2;
      const dimA: Vec2 = [v[0] + Math.cos(angleA) * r, v[1] + Math.sin(angleA) * r];
      const dimB: Vec2 = [v[0] + Math.cos(angleB) * r, v[1] + Math.sin(angleB) * r];
      const textPosition: Vec2 = [
        v[0] + Math.cos(midAng) * r,
        v[1] + Math.sin(midAng) * r,
      ];
      const extLines = [
        { a, b: dimA },
        { a: b, b: dimB },
      ];
      return {
        dimLine: { a: dimA, b: dimB },
        extLines,
        textPosition,
        // Format degrees with the style precision; suppressZeros honored.
        value: `${formatDimensionValue(numericValue, style)}°`,
        numericValue,
        style,
      };
    }
    case "radial": {
      const target = d.entities[dim.refs.entity];
      if (!target) return null;
      const cr = circleOrArcRadius(target);
      if (cr === null) return null;
      const off = dim.offset;
      const dimA = cr.center;
      const dimB: Vec2 = [cr.center[0] + cr.radius + off, cr.center[1]];
      const textPosition: Vec2 = [
        cr.center[0] + cr.radius + off + cr.radius * 0,
        cr.center[1],
      ];
      return {
        dimLine: { a: dimA, b: dimB },
        extLines: [],
        textPosition,
        value: `R${formatDimensionValue(cr.radius, style)}`,
        numericValue: cr.radius,
        style,
      };
    }
    case "diameter": {
      const target = d.entities[dim.refs.entity];
      if (!target) return null;
      const cr = circleOrArcRadius(target);
      if (cr === null) return null;
      const off = dim.offset;
      const dimA: Vec2 = [cr.center[0] - cr.radius, cr.center[1]];
      const dimB: Vec2 = [cr.center[0] + cr.radius + off, cr.center[1]];
      const textPosition: Vec2 = [cr.center[0] + cr.radius + off, cr.center[1]];
      return {
        dimLine: { a: dimA, b: dimB },
        extLines: [],
        textPosition,
        value: `⌀${formatDimensionValue(cr.radius * 2, style)}`,
        numericValue: cr.radius * 2,
        style,
      };
    }
    default: {
      const _exhaustive: never = dim.refs;
      throw new Error(
        `recomputeDimensionGeometry: unknown variant ${String((_exhaustive as { variant: string }).variant)}`,
      );
    }
  }
}

function circleOrArcRadius(e: Entity): { center: Vec2; radius: number } | null {
  if (e.kind === "circle") return { center: e.c, radius: e.r };
  if (e.kind === "arc") return { center: e.c, radius: e.r };
  return null;
}
