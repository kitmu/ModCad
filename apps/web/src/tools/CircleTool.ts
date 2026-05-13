// Center+radius circle tool. First click sets center, second click
// commits a draw.circle.centerRadius. Other construction modes
// (2-point, 3-point) come with the command palette in US2.
import {
  drawCircleCenterRadiusCommand,
  type CircleEntity,
  type Id,
  type Vec2Type,
} from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

const PREVIEW_ID = "transient:circle-preview" as Id;

export class CircleTool implements Tool {
  readonly name = "draw.circle";
  private ctx!: ToolContext;
  private center: Vec2Type | null = null;
  private cursor: Vec2Type = [0, 0];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    this.setStep("pick-center");
  }

  onPointerMove(p: PointerSample): void {
    this.cursor = p.world;
    this.refreshPreview();
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return;
    if (this.center === null) {
      this.center = clone(p.world);
      this.setStep("pick-radius");
      return;
    }
    const r = Math.hypot(p.world[0] - this.center[0], p.world[1] - this.center[1]);
    if (r <= 0) return;
    this.ctx.bus.execute(drawCircleCenterRadiusCommand({ c: this.center, r }));
    this.ctx.syncDirty();
    this.center = null;
    this.ctx.rubberBand.remove(PREVIEW_ID);
    useCommandState.getState().clear();
    this.ctx.done();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.center = null;
      this.ctx.rubberBand.remove(PREVIEW_ID);
      useCommandState.getState().clear();
      this.ctx.done();
    }
  }

  dispose(): void {
    this.ctx?.rubberBand.remove(PREVIEW_ID);
  }

  private refreshPreview(): void {
    if (this.center === null) {
      this.ctx.rubberBand.remove(PREVIEW_ID);
      return;
    }
    const r = Math.hypot(this.cursor[0] - this.center[0], this.cursor[1] - this.center[1]);
    const preview: CircleEntity = {
      id: PREVIEW_ID,
      kind: "circle",
      layerId: this.ctx.bus.drawing.currentLayerId,
      color: "byLayer",
      lineweight: "byLayer",
      c: this.center,
      r,
    };
    this.ctx.rubberBand.set(PREVIEW_ID, preview);
  }

  private setStep(phase: "pick-center" | "pick-radius"): void {
    useCommandState.getState().setActive({
      name: this.name,
      label: "Circle",
      step: {
        prompt: phase === "pick-center" ? "Pick center" : "Pick point on circle",
        hints: ["Esc: cancel"],
      },
    });
  }
}
