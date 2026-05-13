// Two-corner rectangle tool. First click sets corner A, second click
// commits a draw.rectangle. Escape cancels.
import {
  drawRectangleCommand,
  type Id,
  type PolylineEntity,
  type Vec2Type,
} from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { useSnapState } from "../state/snapState.js";
import { snapEndpoint } from "../canvas/snapHelper.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

const PREVIEW_ID = "transient:rect-preview" as Id;

export class RectangleTool implements Tool {
  readonly name = "draw.rectangle";
  private ctx!: ToolContext;
  private corner: Vec2Type | null = null;
  private cursor: Vec2Type = [0, 0];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    this.setStep("pick-first");
  }

  onPointerMove(p: PointerSample): void {
    this.cursor = this.applySnap(p.world);
    this.refreshPreview();
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return;
    const target = this.applySnap(p.world);
    if (this.corner === null) {
      this.corner = clone(target);
      this.setStep("pick-second");
      return;
    }
    this.ctx.bus.execute(drawRectangleCommand({ a: this.corner, b: clone(target) }));
    this.ctx.syncDirty();
    this.corner = null;
    this.ctx.rubberBand.remove(PREVIEW_ID);
    useCommandState.getState().clear();
    this.ctx.done();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.corner = null;
      this.ctx.rubberBand.remove(PREVIEW_ID);
      useCommandState.getState().clear();
      this.ctx.done();
    }
  }

  onCoordinate(point: Vec2Type): void {
    if (this.corner === null) {
      this.corner = clone(point);
      this.setStep("pick-second");
      return;
    }
    this.ctx.bus.execute(drawRectangleCommand({ a: this.corner, b: clone(point) }));
    this.ctx.syncDirty();
    this.corner = null;
    this.ctx.rubberBand.remove(PREVIEW_ID);
    useCommandState.getState().clear();
    this.ctx.done();
  }

  lastPoint(): Vec2Type | null {
    return this.corner;
  }

  dispose(): void {
    this.ctx?.rubberBand.remove(PREVIEW_ID);
  }

  private applySnap(world: Vec2Type): Vec2Type {
    const hit = snapEndpoint(world, this.ctx.bus.drawing, 1);
    if (hit) {
      useSnapState.getState().setMarker({
        point: hit.point,
        mode: hit.mode,
        strength: hit.strength,
        lastCommittedPoint: this.corner,
      });
    } else {
      useSnapState.getState().setMarker(null);
    }
    return hit ? hit.point : world;
  }

  private refreshPreview(): void {
    if (this.corner === null) {
      this.ctx.rubberBand.remove(PREVIEW_ID);
      return;
    }
    const [ax, ay] = this.corner;
    const [bx, by] = this.cursor;
    const preview: PolylineEntity = {
      id: PREVIEW_ID,
      kind: "polyline",
      layerId: this.ctx.bus.drawing.currentLayerId,
      color: "byLayer",
      lineweight: "byLayer",
      vertices: [
        { p: [ax, ay], bulge: 0 },
        { p: [bx, ay], bulge: 0 },
        { p: [bx, by], bulge: 0 },
        { p: [ax, by], bulge: 0 },
      ],
      closed: true,
    };
    this.ctx.rubberBand.set(PREVIEW_ID, preview);
  }

  private setStep(phase: "pick-first" | "pick-second"): void {
    useCommandState.getState().setActive({
      name: this.name,
      label: "Rectangle",
      step: {
        prompt: phase === "pick-first" ? "Pick first corner" : "Pick opposite corner",
        hints: ["Esc: cancel"],
      },
    });
  }
}
