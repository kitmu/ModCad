// Common types for snap-mode evaluators. Each evaluator is a pure
// function (cursor, entity) => SnapCandidate | null. The engine handles
// radius gating and ranking.
import type { Vec2 } from "../../geometry/Vec2.js";
import type { Entity, SnapMode, EntityPointRefKind } from "../../scene/types.js";
import type { Id } from "../../ids.js";

export type SnapStrength = "hard" | "soft";

export type SnapSourceRef = EntityPointRefKind | { kind: "computed" };

export interface SnapCandidate {
  point: Vec2;
  mode: SnapMode;
  strength: SnapStrength;
  source: { entityId: Id; ref: SnapSourceRef };
  /** Distance from cursor to candidate, in screen pixels. */
  distancePx: number;
  /** Stable rank assigned by the engine (0 = best, ascending). */
  rank: number;
}

export type SingleEntityEvaluator = (
  cursor: Vec2,
  entity: Entity,
) => SnapCandidate[] | SnapCandidate | null;
