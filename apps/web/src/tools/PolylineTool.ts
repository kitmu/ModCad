// Polyline tool — drives the kernel's interactive draft (FR-006a):
// `startPolyline` opens a command on the bus, each click pushes a
// vertex sub-step, Backspace pops one (per-step undo), Enter commits
// open, Ctrl+Enter commits closed, Escape cancels.
import { startPolyline, type Id, type PolylineDraft, type PolylineEntity, type Vec2Type } from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

const PREVIEW_ID = "transient:polyline-preview" as Id;

export class PolylineTool implements Tool {
  readonly name = "draw.polyline";
  private ctx!: ToolContext;
  private draft: PolylineDraft | null = null;
  private verts: Vec2Type[] = [];
  private cursor: Vec2Type = [0, 0];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    this.draft = startPolyline(ctx.bus);
    this.verts = [];
    ctx.syncDirty();
    this.setStep();
  }

  onPointerMove(p: PointerSample): void {
    this.cursor = p.world;
    this.refreshPreview();
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0 || !this.draft) return;
    const v = clone(p.world);
    this.draft.addVertex(v);
    this.verts.push(v);
    this.ctx.syncDirty();
    this.setStep();
    this.refreshPreview();
  }

  onKeydown(e: KeyboardEvent): void {
    if (!this.draft) return;
    if (e.key === "Escape") {
      this.ctx.bus.cancel();
      this.ctx.syncDirty();
      this.cleanup();
      return;
    }
    if (e.key === "Backspace" && this.verts.length > 0) {
      this.draft.removeLastVertex();
      this.verts.pop();
      this.ctx.syncDirty();
      this.refreshPreview();
      return;
    }
    if (e.key === "Enter") {
      const closed = e.ctrlKey || e.metaKey;
      this.draft.commit(closed);
      this.ctx.syncDirty();
      this.cleanup();
    }
  }

  dispose(): void {
    if (this.draft) {
      this.ctx.bus.cancel();
      this.ctx.syncDirty();
    }
    this.ctx?.rubberBand.remove(PREVIEW_ID);
  }

  private cleanup(): void {
    this.draft = null;
    this.verts = [];
    this.ctx.rubberBand.remove(PREVIEW_ID);
    useCommandState.getState().clear();
    this.ctx.done();
  }

  private refreshPreview(): void {
    if (this.verts.length === 0) {
      this.ctx.rubberBand.remove(PREVIEW_ID);
      return;
    }
    const preview: PolylineEntity = {
      id: PREVIEW_ID,
      kind: "polyline",
      layerId: this.ctx.bus.drawing.currentLayerId,
      color: "byLayer",
      lineweight: "byLayer",
      vertices: [
        ...this.verts.map((p) => ({ p: clone(p), bulge: 0 })),
        { p: clone(this.cursor), bulge: 0 },
      ],
      closed: false,
    };
    this.ctx.rubberBand.set(PREVIEW_ID, preview);
  }

  private setStep(): void {
    useCommandState.getState().setActive({
      name: this.name,
      label: "Polyline",
      step: {
        prompt: this.verts.length === 0 ? "Pick start point" : "Pick next vertex",
        hints: [
          "Esc: cancel",
          "Enter: commit open",
          "Ctrl+Enter: commit closed",
          "Backspace: undo last vertex",
        ],
      },
    });
  }
}
