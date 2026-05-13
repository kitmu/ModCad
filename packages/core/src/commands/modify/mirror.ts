// modify.mirror — FR-005. Reflect each selected entity across the
// line through `axis.a` -> `axis.b`.
//
// Reflection inverts orientation: arc CCW becomes CW after mirroring,
// so we swap startAngle/endAngle (after mirroring the supporting
// center). For ellipses we mirror the major-axis vector. Polylines
// reverse vertex order so the bulged-arc winding stays consistent
// with the new geometry.
//
// `keepOriginal` (default false) makes mirror also leave the original
// entity in place (AutoCAD's MIRROR with "Erase source objects? N").
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Drawing, Entity } from "../../scene/types.js";
import type { Command } from "../CommandBus.js";

export interface MirrorParams {
  ids: ReadonlyArray<Id>;
  axis: { a: Vec2; b: Vec2 };
  keepOriginal?: boolean;
}

export class DegenerateMirrorAxisError extends Error {
  constructor() {
    super("modify.mirror: axis a == b (zero-length axis)");
    this.name = "DegenerateMirrorAxisError";
  }
}

interface Reflector {
  reflect(p: Vec2): Vec2;
  reflectVec(v: Vec2): Vec2;
  /** Angle delta applied to startAngle: theta' = 2*phi - theta where phi
   *  is the axis angle. We pre-bake 2*phi. */
  twoPhi: number;
}

function makeReflector(a: Vec2, b: Vec2): Reflector {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) throw new DegenerateMirrorAxisError();
  // Reflection matrix about line through `a` with direction (dx, dy):
  //   M = [[ux^2 - uy^2, 2*ux*uy], [2*ux*uy, uy^2 - ux^2]]
  const ux2 = (dx * dx) / lenSq;
  const uy2 = (dy * dy) / lenSq;
  const uxy = (dx * dy) / lenSq;
  const m00 = ux2 - uy2;
  const m01 = 2 * uxy;
  const m11 = uy2 - ux2;
  // Reflect about line passing through `a`:
  //   p' = a + M * (p - a).
  const twoPhi = 2 * Math.atan2(dy, dx);
  return {
    reflect(p: Vec2): Vec2 {
      const px = p[0] - a[0];
      const py = p[1] - a[1];
      return [a[0] + m00 * px + m01 * py, a[1] + m01 * px + m11 * py];
    },
    reflectVec(v: Vec2): Vec2 {
      return [m00 * v[0] + m01 * v[1], m01 * v[0] + m11 * v[1]];
    },
    twoPhi,
  };
}

function mirrorEntity(e: Entity, refl: Reflector, newIdValue: Id): Entity {
  switch (e.kind) {
    case "line":
      return { ...e, id: newIdValue, a: refl.reflect(e.a), b: refl.reflect(e.b) };
    case "polyline":
      return {
        ...e,
        id: newIdValue,
        vertices: e.vertices
          .map((v, i) => ({
            p: refl.reflect(v.p),
            // bulge flips sign on reflection; also reverse direction means
            // the bulge of vertex i must move to the previous segment.
            bulge:
              i === 0 ? 0 : -e.vertices[e.vertices.length - 1 - (i - 1)]!.bulge,
          }))
          .reverse(),
      };
    case "circle":
      return { ...e, id: newIdValue, c: refl.reflect(e.c) };
    case "arc": {
      // CCW arc becomes CW after reflection. Map angles to the
      // reflected frame and swap start/end so the entity stays CCW.
      const newStart = refl.twoPhi - e.endAngle;
      const newEnd = refl.twoPhi - e.startAngle;
      return {
        ...e,
        id: newIdValue,
        c: refl.reflect(e.c),
        startAngle: newStart,
        endAngle: newEnd,
      };
    }
    case "ellipse":
      return {
        ...e,
        id: newIdValue,
        c: refl.reflect(e.c),
        major: refl.reflectVec(e.major),
      };
    case "point":
      return { ...e, id: newIdValue, p: refl.reflect(e.p) };
    case "text":
      return {
        ...e,
        id: newIdValue,
        anchor: refl.reflect(e.anchor),
        // Text rotation reflects to 2*phi - rotation.
        rotation: refl.twoPhi - e.rotation,
      };
    case "dimension":
      return { ...e, id: newIdValue };
    default: {
      const _exhaustive: never = e;
      throw new Error(
        `modify.mirror: unsupported kind ${String((_exhaustive as Entity).kind)}`,
      );
    }
  }
}

export function mirrorCommand(params: MirrorParams): Command<MirrorParams> {
  const refl = makeReflector(params.axis.a, params.axis.b);
  const keep = params.keepOriginal === true;
  const sourceIds = [...params.ids];

  if (keep) {
    // Behaves like copy: new ids, originals preserved.
    const targetIds: Id[] = sourceIds.map(() => newId());
    return {
      name: "modify.mirror",
      params,
      apply(draft: Draft<Drawing>) {
        for (let i = 0; i < sourceIds.length; i++) {
          const src = draft.entities[sourceIds[i]!];
          if (!src) continue;
          const dst = mirrorEntity(src as Entity, refl, targetIds[i]!);
          draft.entities[targetIds[i]!] = castDraft(dst);
          draft.entityOrder.push(targetIds[i]!);
        }
      },
      inverse(draft: Draft<Drawing>) {
        for (const id of targetIds) {
          delete draft.entities[id];
          const idx = draft.entityOrder.indexOf(id);
          if (idx >= 0) draft.entityOrder.splice(idx, 1);
        }
      },
    };
  }

  // In-place: snapshot prior shape so inverse can restore.
  const snapshots = new Map<Id, Entity>();
  return {
    name: "modify.mirror",
    params,
    apply(draft: Draft<Drawing>) {
      snapshots.clear();
      for (const id of sourceIds) {
        const src = draft.entities[id];
        if (!src) continue;
        snapshots.set(id, JSON.parse(JSON.stringify(src)) as Entity);
        const mirrored = mirrorEntity(src as Entity, refl, id);
        draft.entities[id] = castDraft(mirrored);
      }
    },
    inverse(draft: Draft<Drawing>) {
      for (const [id, snap] of snapshots) {
        if (draft.entities[id]) draft.entities[id] = castDraft(snap);
      }
    },
  };
}
