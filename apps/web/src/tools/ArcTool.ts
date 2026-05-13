// Three-point arc: start, through, end. Other construction modes
// (center+ends, etc.) come with the command palette in US2.
import {
  drawArc3PointCommand,
  CollinearError,
  type Id,
  type Vec2Type,
} from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

const PREVIEW_ID = "transient:arc-preview" as Id;

export class ArcTool implements Tool {
  readonly name = "draw.arc";
  private ctx!: ToolContext;
  private points: Vec2Type[] = [];
  private cursor: Vec2Type = [0, 0];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    this.points = [];
    this.setStep();
  }

  onPointerMove(p: PointerSample): void {
    this.cursor = p.world;
    this.refreshPreview();
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return;
    this.points.push(clone(p.world));
    if (this.points.length === 3) {
      const [a, b, c] = this.points;
      try {
        this.ctx.bus.execute(drawArc3PointCommand({ a: a!, b: b!, c: c! }));
        this.ctx.syncDirty();
      } catch (err) {
        if (!(err instanceof CollinearError)) throw err;
        // Collinear — refuse silently; future toast wiring lands with US4.
      }
      this.points = [];
      this.ctx.rubberBand.remove(PREVIEW_ID);
      useCommandState.getState().clear();
      this.ctx.done();
      return;
    }
    this.setStep();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.points = [];
      this.ctx.rubberBand.remove(PREVIEW_ID);
      useCommandState.getState().clear();
      this.ctx.done();
    }
  }

  dispose(): void {
    this.ctx?.rubberBand.remove(PREVIEW_ID);
  }

  private refreshPreview(): void {
    // Lightweight preview: a polyline connecting placed points + cursor.
    if (this.points.length === 0) {
      this.ctx.rubberBand.remove(PREVIEW_ID);
      return;
    }
    const verts = [
      ...this.points.map((p) => ({ p: clone(p), bulge: 0 })),
      { p: clone(this.cursor), bulge: 0 },
    ];
    this.ctx.rubberBand.set(PREVIEW_ID, {
      id: PREVIEW_ID,
      kind: "polyline",
      layerId: this.ctx.bus.drawing.currentLayerId,
      color: "byLayer",
      lineweight: "byLayer",
      vertices: verts,
      closed: false,
    });
  }

  private setStep(): void {
    const prompts = ["Pick arc start", "Pick point on arc", "Pick arc end"];
    useCommandState.getState().setActive({
      name: this.name,
      label: "Arc",
      step: {
        prompt: prompts[this.points.length] ?? "Pick point",
        hints: ["Esc: cancel"],
      },
    });
  }
}
