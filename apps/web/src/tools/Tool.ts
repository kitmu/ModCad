// Tool contract. A tool runs against:
//   - the active CommandBus (to commit / begin / pushSubStep / cancel),
//   - the rubber-band layer (for cursor preview),
//   - the command-state slice (to surface prompts).
//
// Tools are stateful by design (each click advances the construction);
// CanvasHost owns the active instance and replaces it on tool change.
import type { CommandBus, Vec2Type } from "@modcad/core";
import type { PointerSample } from "../canvas/PointerInput.js";
import type { RubberBand } from "../canvas/RubberBand.js";

export interface ToolContext {
  bus: CommandBus;
  rubberBand: RubberBand;
  /** Called by the tool to mark the active slice as dirty after a commit. */
  syncDirty: () => void;
  /** Called when the tool has finished (committed or cancelled). */
  done: () => void;
}

export interface Tool {
  readonly name: string;
  start(ctx: ToolContext): void;
  onPointerMove(p: PointerSample): void;
  onPointerDown(p: PointerSample): void;
  onKeydown(e: KeyboardEvent): void;
  /** Called by CanvasHost when the user switches tools or closes the slice. */
  dispose(): void;
  /**
   * Typed-coordinate input from the palette/command-line bar (T067).
   * `point` is already parsed (absolute world coordinates). Tools that
   * support typed input behave as if the user clicked at `point` and
   * advance their state machine; tools that don't (point tool, etc.)
   * may treat it as a single-shot placement or no-op.
   */
  onCoordinate?(point: Vec2Type): void;
  /**
   * Most recently committed point in the tool's in-flight construction,
   * if any. Used as `ParseContext.lastPoint` for `@dx,dy` and `@d<a`.
   */
  lastPoint?(): Vec2Type | null;
}

/** Helper for tools: clone a Vec2 so later mutations don't reach the kernel. */
export function clone(v: Vec2Type): Vec2Type {
  return [v[0], v[1]];
}
