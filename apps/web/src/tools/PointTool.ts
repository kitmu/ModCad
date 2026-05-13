// Single-click point tool. Each click commits a draw.point and re-arms
// for the next placement. Escape exits.
import { drawPointCommand } from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

export class PointTool implements Tool {
  readonly name = "draw.point";
  private ctx!: ToolContext;

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    useCommandState.getState().setActive({
      name: this.name,
      label: "Point",
      step: { prompt: "Pick point", hints: ["Esc: exit"] },
    });
  }

  onPointerMove(): void {
    /* point tool has no preview */
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return;
    this.ctx.bus.execute(drawPointCommand({ p: clone(p.world) }));
    this.ctx.syncDirty();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      useCommandState.getState().clear();
      this.ctx.done();
    }
  }

  dispose(): void {
    /* nothing to clean up */
  }
}
