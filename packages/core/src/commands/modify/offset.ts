// modify.offset — FR-005. Create a parallel copy of one entity at a
// signed perpendicular distance.
//
// v1 supports Line, Polyline (zero-bulge segments — bulged segments
// throw), Circle, Arc. Ellipse / Text / Point / Dimension are
// explicitly unsupported and throw `UnsupportedOffsetError`. The
// offset preserves layer/color/lineweight.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type {
  ArcEntity,
  CircleEntity,
  Drawing,
  Entity,
  LineEntity,
  PolylineEntity,
} from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface OffsetParams {
  id: Id;
  /** Signed perpendicular distance. Sign follows the curve's
   *  left-normal (CCW direction). */
  distance: number;
}

export class UnsupportedOffsetError extends Error {
  constructor(kind: string) {
    super(`modify.offset: unsupported entity kind "${kind}"`);
    this.name = "UnsupportedOffsetError";
  }
}

function offsetLine(e: LineEntity, d: number, newIdValue: Id): LineEntity {
  const dx = e.b[0] - e.a[0];
  const dy = e.b[1] - e.a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ...e, id: newIdValue };
  // Left normal of (dx, dy) is (-dy, dx) — same convention as the
  // intersection helpers.
  const nx = (-dy / len) * d;
  const ny = (dx / len) * d;
  return {
    ...e,
    id: newIdValue,
    a: [e.a[0] + nx, e.a[1] + ny],
    b: [e.b[0] + nx, e.b[1] + ny],
  };
}

function offsetCircle(e: CircleEntity, d: number, newIdValue: Id): CircleEntity {
  // Positive d grows the circle (outward); negative shrinks. Inward
  // offset that would invert the radius collapses to a near-zero
  // circle — we let the negative radius surface so callers can detect
  // the degenerate case, then clamp to >= 0.
  const newR = e.r + d;
  return {
    ...e,
    id: newIdValue,
    r: Math.max(newR, 0),
  };
}

function offsetArc(e: ArcEntity, d: number, newIdValue: Id): ArcEntity {
  return {
    ...e,
    id: newIdValue,
    r: Math.max(e.r + d, 0),
  };
}

function offsetPolyline(
  e: PolylineEntity,
  d: number,
  newIdValue: Id,
): PolylineEntity {
  // Reject bulged segments — robust polyline offset requires arc
  // joinery that's deferred to the booleans facade.
  for (const v of e.vertices) {
    if (v.bulge !== 0) {
      throw new UnsupportedOffsetError("polyline-with-bulge");
    }
  }
  const n = e.vertices.length;
  if (n < 2) return { ...e, id: newIdValue };
  // Compute per-segment left normals, then average adjacent normals
  // at each interior vertex (miter join). Endpoint normals use only
  // their incident segment.
  const segN: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = e.vertices[i]!.p;
    const b = e.vertices[i + 1]!.p;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    segN.push(len === 0 ? [0, 0] : [-dy / len, dx / len]);
  }
  const vertexN: Vec2[] = new Array(n);
  if (e.closed) {
    // Wrap: last segment is from v[n-1] to v[0].
    const a = e.vertices[n - 1]!.p;
    const b = e.vertices[0]!.p;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    segN.push(len === 0 ? [0, 0] : [-dy / len, dx / len]);
  }
  for (let i = 0; i < n; i++) {
    let n1: Vec2;
    let n2: Vec2;
    if (e.closed) {
      n1 = segN[(i - 1 + n) % n]!;
      n2 = segN[i % n]!;
    } else {
      n1 = i === 0 ? segN[0]! : segN[i - 1]!;
      n2 = i === n - 1 ? segN[n - 2]! : segN[i]!;
    }
    // Average and renormalize. For collinear segments the average is
    // identical to either input.
    const ax = n1[0] + n2[0];
    const ay = n1[1] + n2[1];
    const al = Math.hypot(ax, ay);
    vertexN[i] = al === 0 ? [n1[0], n1[1]] : [ax / al, ay / al];
    // Miter length: 1 / dot(avg, n1). Clamp at 4× to avoid extreme spikes.
    const dot = vertexN[i]![0] * n1[0] + vertexN[i]![1] * n1[1];
    const miter = dot === 0 ? 1 : 1 / dot;
    const clamped = Math.max(-4, Math.min(4, miter));
    vertexN[i] = [vertexN[i]![0] * clamped, vertexN[i]![1] * clamped];
  }
  return {
    ...e,
    id: newIdValue,
    vertices: e.vertices.map((v, i) => ({
      p: [v.p[0] + vertexN[i]![0] * d, v.p[1] + vertexN[i]![1] * d],
      bulge: v.bulge,
    })),
  };
}

function offsetEntity(e: Entity, d: number, newIdValue: Id): Entity {
  switch (e.kind) {
    case "line":
      return offsetLine(e, d, newIdValue);
    case "circle":
      return offsetCircle(e, d, newIdValue);
    case "arc":
      return offsetArc(e, d, newIdValue);
    case "polyline":
      return offsetPolyline(e, d, newIdValue);
    case "ellipse":
    case "text":
    case "point":
    case "dimension":
      throw new UnsupportedOffsetError(e.kind);
    default: {
      const _exhaustive: never = e;
      throw new UnsupportedOffsetError(String((_exhaustive as Entity).kind));
    }
  }
}

export function offsetCommand(params: OffsetParams): Command<OffsetParams> {
  const newIdValue: Id = newId();
  return {
    name: "modify.offset",
    params,
    apply(draft: Draft<Drawing>) {
      const src = draft.entities[params.id];
      if (!src) return;
      const dst = offsetEntity(src as Entity, params.distance, newIdValue);
      draft.entities[newIdValue] = castDraft(dst);
      draft.entityOrder.push(newIdValue);
    },
    inverse(draft: Draft<Drawing>) {
      delete draft.entities[newIdValue];
      const idx = draft.entityOrder.indexOf(newIdValue);
      if (idx >= 0) draft.entityOrder.splice(idx, 1);
    },
  };
}
