// Shared input → command dispatcher used by both the modal palette
// and the bottom command-line bar (T066, T067).
//
// Resolution rules, in order:
//   1. If the input parses as a coordinate (`x,y`, `@dx,dy`, `@d<a`),
//      send the parsed point to the active tool's `onCoordinate`.
//   2. Otherwise treat the input as a command lookup: top-ranked
//      registry hit wins. The chosen command is dispatched through
//      the router.
//
// The component layer decides *when* to call this (Enter key, palette
// row click, …) and handles UI state — this module is the kernel-side
// orchestrator: pure functions plus the router singleton.
import { builtinRegistry, parseCoord, type Vec2Type } from "@modcad/core";
import { rank, type PaletteCandidate, type Ranked } from "@modcad/ui-kit";
import { commandRouter } from "./commandRouter.js";

const CANDIDATES: PaletteCandidate[] = builtinRegistry.all().map((def) => {
  const cand: PaletteCandidate = {
    name: def.name,
    summary: def.summary,
    aliases: def.aliases,
  };
  if (def.defaultBinding !== undefined) cand.binding = def.defaultBinding;
  return cand;
});

export function rankedFor(query: string): Ranked[] {
  return rank(query, CANDIDATES);
}

export type ActivationResult =
  | { kind: "command"; name: string }
  | { kind: "coordinate"; point: Vec2Type }
  | { kind: "error"; error: string };

/**
 * Resolve `input` to an actionable result without firing it. The
 * caller (palette / command-line bar) is responsible for invoking
 * the router; centralising parsing here keeps both surfaces in sync.
 */
export function resolveInput(input: string, override?: string): ActivationResult {
  const text = (override ?? input).trim();
  if (text === "") return { kind: "error", error: "empty input" };
  // Coordinate paths must start with a digit, sign, '.' or '@'.
  if (/^[@+\-0-9.]/.test(text)) {
    const ctx = { lastPoint: commandRouter.lastPoint(), angleUnit: "deg" as const };
    const parsed = parseCoord(text, ctx);
    if (parsed.ok) return { kind: "coordinate", point: parsed.point };
    // Fall through to command resolution only if the input clearly
    // isn't a coordinate attempt — but a leading digit/@ means the
    // user *meant* a coordinate. Surface the parse error.
    return { kind: "error", error: parsed.error };
  }
  // Command lookup.
  const hits = rankedFor(text);
  const top = hits[0];
  if (!top) return { kind: "error", error: `no command matches "${text}"` };
  return { kind: "command", name: top.name };
}

/** Fire an ActivationResult against the router. */
export function applyActivation(result: ActivationResult): boolean {
  if (result.kind === "command") return commandRouter.dispatch(result.name);
  if (result.kind === "coordinate") return commandRouter.sendCoordinate(result.point);
  return false;
}
