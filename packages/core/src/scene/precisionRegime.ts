// Three-tier precision regime per Constitution Principle I:
//   Tier A: 0–1e6 units from local origin — full FP64 precision.
//   Tier B: 1e6–1e9 units — precision degrades proportionally; predicates
//           remain robust because they evaluate in local-origin frame.
//   Tier C: >1e9 units — refused at the kernel boundary.
//
// Origin-rebase trigger: when the active viewport center wanders past
// 5e5 units from the local origin, callers issue an OriginRebaseCommand
// to recenter and emit an `origin-rebased` event.
import type { Bbox } from "../geometry/Bbox.js";
import type { PrecisionTier } from "./types.js";

export const TIER_A_LIMIT = 1e6;
export const TIER_B_LIMIT = 1e9;
export const REBASE_TRIGGER = 5e5;

export function classifyDistance(d: number): PrecisionTier {
  const a = Math.abs(d);
  if (a <= TIER_A_LIMIT) return "A";
  if (a <= TIER_B_LIMIT) return "B";
  return "C";
}

export function classifyBbox(b: Bbox): PrecisionTier {
  const farthest = Math.max(
    Math.abs(b.minX),
    Math.abs(b.minY),
    Math.abs(b.maxX),
    Math.abs(b.maxY),
  );
  return classifyDistance(farthest);
}

export function shouldRebase(viewportCenterDistance: number): boolean {
  return Math.abs(viewportCenterDistance) > REBASE_TRIGGER;
}

export class TierCRefusedError extends Error {
  constructor(public readonly distance: number) {
    super(`coordinate ${distance} exceeds Tier C limit (${TIER_B_LIMIT})`);
    this.name = "TierCRefusedError";
  }
}

export function assertTierBOrBetter(coord: number): void {
  if (classifyDistance(coord) === "C") throw new TierCRefusedError(coord);
}
