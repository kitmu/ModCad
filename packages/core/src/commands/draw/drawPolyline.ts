// draw.polyline — FR-001 + FR-006a (per-step undo during drafting).
//
// Two entry points:
//
//   1. `drawPolylineCommand({ vertices, closed, layerId? })` — one-shot,
//      for callers that already have the full vertex list (e.g. paste,
//      DXF import, scripted construction). Executes as a single undo unit.
//
//   2. `startPolyline(bus, layerId?)` — interactive draft. Returns a
//      `PolylineDraft` that drives the bus's `beginCommand` /
//      `pushSubStep` / `commitCommand` lifecycle internally so the
//      canvas-host can stay short:
//
//        const draft = startPolyline(bus);
//        draft.addVertex([0,0]);
//        draft.addVertex([1,0]);
//        bus.undoStep();       // FR-006a: removes the last vertex
//        const cmd = draft.commit(true);
//
//      The kernel does need a bus reference here because the contract
//      shipped to apps/web (specs/001-2d-drafting-mvp/spec.md FR-006a)
//      requires void-returning `addVertex` / `removeLastVertex`.
import { castDraft, type Draft } from "immer";
import { newId, type Id } from "../../ids.js";
import type { Vec2 } from "../../geometry/Vec2.js";
import type {
  Drawing,
  PolylineEntity,
  PolylineVertex,
} from "../../scene/types.js";
import type { Command, CommandBus, SubStep } from "../CommandBus.js";

export interface DrawPolylineParams {
  vertices: Vec2[];
  closed: boolean;
  layerId?: Id;
}

export function drawPolylineCommand(
  params: DrawPolylineParams,
): Command<DrawPolylineParams> {
  const id = newId();
  // Freeze the input snapshot so later caller mutation can't reach in.
  const vertexSnapshot: PolylineVertex[] = params.vertices.map((p) => ({
    p: [p[0], p[1]],
    bulge: 0,
  }));
  const closed = params.closed;
  return {
    name: "draw.polyline",
    params,
    apply(draft: Draft<Drawing>) {
      const entity: PolylineEntity = {
        id,
        kind: "polyline",
        layerId: params.layerId ?? draft.currentLayerId,
        color: "byLayer",
        lineweight: "byLayer",
        vertices: vertexSnapshot.map((v) => ({ p: [v.p[0], v.p[1]], bulge: v.bulge })),
        closed,
      };
      draft.entities[id] = castDraft(entity);
      draft.entityOrder.push(id);
    },
    inverse(draft: Draft<Drawing>) {
      delete draft.entities[id];
      const i = draft.entityOrder.indexOf(id);
      if (i >= 0) draft.entityOrder.splice(i, 1);
    },
  };
}

export interface PolylineDraft {
  /** The shell command actually attached via `bus.beginCommand`. */
  command: Command<{ id: Id }>;
  /** Append a vertex (pushes a sub-step through the bus). */
  addVertex(p: Vec2): void;
  /** Pop the last vertex (pushes a sub-step through the bus). */
  removeLastVertex(): void;
  /**
   * Finalize the polyline. Pushes a closed-flag sub-step (when needed),
   * calls `bus.commitCommand`, and returns the underlying command so
   * the caller can reference it (e.g. for status events).
   */
  commit(closed: boolean): Command<{ id: Id }>;
  /** The id allocated for the in-flight polyline. */
  id: Id;
}

function buildShellCommand(id: Id, layerId: Id | undefined): Command<{ id: Id }> {
  return {
    name: "draw.polyline",
    params: { id },
    apply(draft: Draft<Drawing>) {
      const entity: PolylineEntity = {
        id,
        kind: "polyline",
        layerId: layerId ?? draft.currentLayerId,
        color: "byLayer",
        lineweight: "byLayer",
        vertices: [],
        closed: false,
      };
      draft.entities[id] = castDraft(entity);
      draft.entityOrder.push(id);
    },
    inverse(draft: Draft<Drawing>) {
      delete draft.entities[id];
      const i = draft.entityOrder.indexOf(id);
      if (i >= 0) draft.entityOrder.splice(i, 1);
    },
  };
}

function addVertexStep(id: Id, p: Vec2): SubStep {
  const captured: Vec2 = [p[0], p[1]];
  return {
    apply(draft: Draft<Drawing>) {
      const e = draft.entities[id];
      if (e && e.kind === "polyline") {
        e.vertices.push(castDraft({ p: captured, bulge: 0 }));
      }
    },
    inverse(draft: Draft<Drawing>) {
      const e = draft.entities[id];
      if (e && e.kind === "polyline") e.vertices.pop();
    },
  };
}

function removeLastVertexStep(id: Id): SubStep {
  let captured: PolylineVertex | undefined;
  return {
    apply(draft: Draft<Drawing>) {
      const e = draft.entities[id];
      if (e && e.kind === "polyline") {
        const v = e.vertices.pop();
        if (v) captured = { p: [v.p[0], v.p[1]], bulge: v.bulge };
      }
    },
    inverse(draft: Draft<Drawing>) {
      const e = draft.entities[id];
      if (e && e.kind === "polyline" && captured) {
        e.vertices.push(castDraft({ p: captured.p, bulge: captured.bulge }));
      }
    },
  };
}

function setClosedStep(id: Id, closed: boolean): SubStep {
  let prev = false;
  return {
    apply(draft: Draft<Drawing>) {
      const e = draft.entities[id];
      if (e && e.kind === "polyline") {
        prev = e.closed;
        e.closed = closed;
      }
    },
    inverse(draft: Draft<Drawing>) {
      const e = draft.entities[id];
      if (e && e.kind === "polyline") e.closed = prev;
    },
  };
}

/**
 * Begin an interactive polyline. Calls `bus.beginCommand` immediately
 * with the shell command and returns a `PolylineDraft` whose methods
 * route through the same bus.
 */
export function startPolyline(bus: CommandBus, layerId?: Id): PolylineDraft {
  const id = newId();
  const command = buildShellCommand(id, layerId);
  bus.beginCommand(command);
  return {
    id,
    command,
    addVertex(p: Vec2): void {
      bus.pushSubStep(addVertexStep(id, p));
    },
    removeLastVertex(): void {
      bus.pushSubStep(removeLastVertexStep(id));
    },
    commit(closed: boolean): Command<{ id: Id }> {
      if (closed) bus.pushSubStep(setClosedStep(id, true));
      bus.commitCommand();
      return command;
    },
  };
}
