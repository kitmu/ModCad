// MoveTool — drives modify.move from the canvas.
//
// Flow:
//   1. If selection is non-empty, use it. Otherwise prompt the user to
//      pick (Phase 7+ TODO: integrate fence/window selection).
//   2. Pick base point.
//   3. Pick target point. Commit a single moveCommand with delta = target - base.
import {
  moveCommand,
  type Id,
  type Vec2Type,
} from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { useSelection } from "../state/selection.js";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { snapEndpoint } from "../canvas/snapHelper.js";
import { useSnapState } from "../state/snapState.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

type Phase = "pick-base" | "pick-target";

export class MoveTool implements Tool {
  readonly name = "modify.move";
  private ctx!: ToolContext;
  private basePoint: Vec2Type | null = null;
  private phase: Phase = "pick-base";
  private ids: Id[] = [];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    const sliceId = useDrawingSession.getState().activeId;
    const sel = sliceId ? useSelection.getState().get(sliceId) : [];
    this.ids = [...sel];
    if (this.ids.length === 0) {
      // No pre-selection: surface a hint and exit. Phase 7+ will
      // integrate post-selection; v1 of the move tool only handles
      // the pre-selection case driven by the e2e spec.
      useCommandState.getState().setActive({
        name: this.name,
        label: "Move",
        step: {
          prompt: "Select objects, then run Move again",
          hints: ["Esc: cancel"],
        },
      });
      this.ctx.done();
      useCommandState.getState().clear();
      return;
    }
    this.setStep("pick-base");
  }

  onPointerMove(p: PointerSample): void {
    const hit = snapEndpoint(p.world, this.ctx.bus.drawing, 1);
    useSnapState.getState().set(hit ? hit.point : null);
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return;
    const hit = snapEndpoint(p.world, this.ctx.bus.drawing, 1);
    const target: Vec2Type = hit ? hit.point : p.world;
    if (this.phase === "pick-base") {
      this.basePoint = clone(target);
      this.phase = "pick-target";
      this.setStep("pick-target");
      return;
    }
    // pick-target: commit.
    if (!this.basePoint) return;
    const delta: Vec2Type = [
      target[0] - this.basePoint[0],
      target[1] - this.basePoint[1],
    ];
    this.ctx.bus.execute(moveCommand({ ids: this.ids, delta }));
    this.ctx.syncDirty();
    useCommandState.getState().clear();
    useSnapState.getState().set(null);
    this.ctx.done();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      useCommandState.getState().clear();
      useSnapState.getState().set(null);
      this.ctx.done();
    }
  }

  dispose(): void {
    // Nothing to clean up beyond clearing transient UI state.
  }

  private setStep(phase: Phase): void {
    this.phase = phase;
    useCommandState.getState().setActive({
      name: this.name,
      label: "Move",
      step: {
        prompt:
          phase === "pick-base" ? "Pick base point" : "Pick target point",
        hints: ["Esc: cancel"],
      },
    });
  }
}
