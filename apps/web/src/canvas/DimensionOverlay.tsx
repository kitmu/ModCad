// T082 — Dimension overlay (text + leader lines via Canvas2D).
//
// The fat-line renderer in @modcad/renderer doesn't yet handle text
// glyphs (the SDF atlas from research.md is unbuilt — TODO(T046) raw
// strings). For US4 we draw dimension geometry (dim line + extension
// lines + value label) on a transient 2D-canvas overlay positioned on
// top of the WebGPU surface. Every render derives from
// `recomputeDimensionGeometry` so associative re-flow is automatic.
//
// TODO(T046 SDF atlas): once the renderer gains glyph support, fold
// this overlay back into the GPU pipeline.
import { useEffect, useRef } from "react";
import {
  recomputeDimensionGeometry,
  type Drawing,
  type Vec2Type,
} from "@modcad/core";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { useViewportState } from "../state/viewportState.js";

function worldToScreen(
  p: Vec2Type,
  center: Vec2Type,
  zoom: number,
  rect: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: (p[0] - center[0]) * zoom + rect.width / 2,
    y: -(p[1] - center[1]) * zoom + rect.height / 2,
  };
}

function paint(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  center: Vec2Type,
  zoom: number,
  rect: { width: number; height: number },
): void {
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ddd";
  ctx.fillStyle = "#ddd";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const id of drawing.entityOrder) {
    const e = drawing.entities[id];
    if (!e || e.kind !== "dimension") continue;
    const g = recomputeDimensionGeometry(drawing, id);
    if (!g) continue;
    const a = worldToScreen(g.dimLine.a, center, zoom, rect);
    const b = worldToScreen(g.dimLine.b, center, zoom, rect);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const ext of g.extLines) {
      const p1 = worldToScreen(ext.a, center, zoom, rect);
      const p2 = worldToScreen(ext.b, center, zoom, rect);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    const t = worldToScreen(g.textPosition, center, zoom, rect);
    // Background pill behind text for legibility.
    const pad = 3;
    const metrics = ctx.measureText(g.value);
    const w = metrics.width + pad * 2;
    const h = 16;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(t.x - w / 2, t.y - h / 2, w, h);
    ctx.fillStyle = "#ffcc66";
    ctx.fillText(g.value, t.x, t.y);
  }
  ctx.restore();
}

export function DimensionOverlay(): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const slices = useDrawingSession((s) => s.slices);
  const activeId = useDrawingSession((s) => s.activeId);
  const center = useViewportState((s) => s.center);
  const zoom = useViewportState((s) => s.zoom);
  const rect = useViewportState((s) => s.rect);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !rect) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const active = slices.find((s) => s.id === activeId);
    if (active) paint(ctx, active.drawing, center, zoom, rect);
  }, [slices, activeId, center, zoom, rect]);

  return (
    <canvas
      ref={ref}
      data-testid="dimension-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    />
  );
}
