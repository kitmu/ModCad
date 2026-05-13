// Polygon booleans facade.
//
// The MVP wires Clipper2-WASM behind this facade (Phase 8 build); the
// kernel itself never depends on a specific implementation. The wasm
// build runs in a Web Worker via comlink and is installed at app boot
// via `installBooleans`. Until that phase lands, the slot is empty
// and any call into `booleans.*` throws.
//
// Property tests against degenerate inputs (collinear edges, exact
// touches, near-zero-area slivers) live alongside the wasm wiring —
// not here — because they must run against the actual Vatti backend.
//
// TODO(phase-8): build Clipper2-WASM, expose it through this facade,
// and add the comlink worker. See research.md §"Geometry predicates
// and booleans".
import type { Vec2 } from "./Vec2.js";

export interface PolygonBooleans {
  union(a: Vec2[][], b: Vec2[][]): Vec2[][];
  difference(a: Vec2[][], b: Vec2[][]): Vec2[][];
  intersection(a: Vec2[][], b: Vec2[][]): Vec2[][];
  offsetPolygon(poly: Vec2[][], delta: number): Vec2[][];
}

const NOT_INSTALLED: PolygonBooleans = {
  union: notInstalled,
  difference: notInstalled,
  intersection: notInstalled,
  offsetPolygon: notInstalled,
};

function notInstalled(): never {
  throw new Error(
    "booleans backend not installed — call installBooleans() before invoking any polygon boolean operation",
  );
}

export let booleans: PolygonBooleans = NOT_INSTALLED;
let installed = false;

/**
 * Install the polygon-boolean implementation. Called once at app boot
 * (e.g. after the Clipper2-WASM worker is ready). A second call is a
 * programming error; we throw to make the misuse loud.
 */
export function installBooleans(impl: PolygonBooleans): void {
  if (installed) {
    throw new Error("installBooleans: backend already installed; re-installation is not permitted");
  }
  booleans = impl;
  installed = true;
}
