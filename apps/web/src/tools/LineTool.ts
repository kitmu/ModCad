// Two-click line tool. First click latches the start; second click
// commits a draw.line and arms the next segment so consecutive lines
// chain (AutoCAD-style). Escape clears the in-flight start.
import { drawLineCommand, type Id, type LineEntity, type Vec2Type } from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

const PREVIEW_ID = "transient:line-preview" as Id;

export class LineTool implements Tool {
  readonly name = "draw.line";
  private ctx!: ToolContext;
  private startPoint: Vec2Type | null = null;
  private cursor: Vec2Type = [0, 0];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    this.setStep("pick-first");
  }

  onPointerMove(p: PointerSample): void {
    this.cursor = p.world;
    this.refreshPreview();
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return; // primary only
    if (this.startPoint === null) {
      this.startPoint = clone(p.world);
      this.setStep("pick-second");
      return;
    }
    this.ctx.bus.execute(drawLineCommand({ a: this.startPoint, b: clone(p.world) }));
    this.ctx.syncDirty();
    // Chain: re-arm with the just-placed point as the new start.
    this.startPoint = clone(p.world);
    this.refreshPreview();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.startPoint = null;
      this.ctx.rubberBand.remove(PREVIEW_ID);
      useCommandState.getState().clear();
      this.ctx.done();
    }
  }

  dispose(): void {
    this.ctx?.rubberBand.remove(PREVIEW_ID);
  }

  private refreshPreview(): void {
    if (this.startPoint === null) {
      this.ctx.rubberBand.remove(PREVIEW_ID);
      return;
    }
    const preview: LineEntity = {
      id: PREVIEW_ID,
      kind: "line",
      layerId: this.ctx.bus.drawing.currentLayerId,
      color: "byLayer",
      lineweight: "byLayer",
      a: this.startPoint,
      b: this.cursor,
    };
    this.ctx.rubberBand.set(PREVIEW_ID, preview);
  }

  private setStep(phase: "pick-first" | "pick-second"): void {
    useCommandState.getState().setActive({
      name: this.name,
      label: "Line",
      step: {
        prompt: phase === "pick-first" ? "Pick first point" : "Pick next point",
        hints:
          phase === "pick-first"
            ? ["Esc: cancel"]
            : ["Esc: end line", "Click: place segment"],
      },
    });
  }
}
