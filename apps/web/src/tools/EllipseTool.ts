// Center / major-axis-endpoint / ratio-point ellipse tool.
// Click 1: center. Click 2: major-axis endpoint. Click 3: a point that
// defines the minor-axis distance (ratio = minor/major).
import {
  drawEllipseCommand,
  type EllipseEntity,
  type Id,
  type Vec2Type,
} from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

const PREVIEW_ID = "transient:ellipse-preview" as Id;

export class EllipseTool implements Tool {
  readonly name = "draw.ellipse";
  private ctx!: ToolContext;
  private center: Vec2Type | null = null;
  private majorEnd: Vec2Type | null = null;
  private cursor: Vec2Type = [0, 0];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    this.setStep();
  }

  onPointerMove(p: PointerSample): void {
    this.cursor = p.world;
    this.refreshPreview();
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return;
    if (this.center === null) {
      this.center = clone(p.world);
      this.setStep();
      return;
    }
    if (this.majorEnd === null) {
      this.majorEnd = clone(p.world);
      this.setStep();
      return;
    }
    const ratio = this.computeRatio(p.world);
    if (ratio > 0) {
      const major: Vec2Type = [
        this.majorEnd[0] - this.center[0],
        this.majorEnd[1] - this.center[1],
      ];
      this.ctx.bus.execute(drawEllipseCommand({ c: this.center, major, ratio }));
      this.ctx.syncDirty();
    }
    this.cleanup();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") this.cleanup();
  }

  dispose(): void {
    this.ctx?.rubberBand.remove(PREVIEW_ID);
  }

  private cleanup(): void {
    this.center = null;
    this.majorEnd = null;
    this.ctx.rubberBand.remove(PREVIEW_ID);
    useCommandState.getState().clear();
    this.ctx.done();
  }

  private computeRatio(p: Vec2Type): number {
    if (!this.center || !this.majorEnd) return 0;
    const majorLen = Math.hypot(
      this.majorEnd[0] - this.center[0],
      this.majorEnd[1] - this.center[1],
    );
    if (majorLen === 0) return 0;
    const minorLen = Math.hypot(p[0] - this.center[0], p[1] - this.center[1]);
    const r = minorLen / majorLen;
    return Math.max(0.001, Math.min(r, 1));
  }

  private refreshPreview(): void {
    if (this.center === null) {
      this.ctx.rubberBand.remove(PREVIEW_ID);
      return;
    }
    const majorEnd = this.majorEnd ?? this.cursor;
    const major: Vec2Type = [majorEnd[0] - this.center[0], majorEnd[1] - this.center[1]];
    const ratio = this.majorEnd === null ? 1 : this.computeRatio(this.cursor);
    const preview: EllipseEntity = {
      id: PREVIEW_ID,
      kind: "ellipse",
      layerId: this.ctx.bus.drawing.currentLayerId,
      color: "byLayer",
      lineweight: "byLayer",
      c: this.center,
      major,
      ratio,
      startParam: 0,
      endParam: 2 * Math.PI,
    };
    this.ctx.rubberBand.set(PREVIEW_ID, preview);
  }

  private setStep(): void {
    const step =
      this.center === null
        ? { prompt: "Pick ellipse center", hints: ["Esc: cancel"] }
        : this.majorEnd === null
          ? { prompt: "Pick major-axis endpoint", hints: ["Esc: cancel"] }
          : { prompt: "Pick minor-axis distance", hints: ["Esc: cancel"] };
    useCommandState.getState().setActive({
      name: this.name,
      label: "Ellipse",
      step,
    });
  }
}
