// T118 — Minimap overlay.
//
// A 200×150 canvas anchored bottom-right. Renders the drawing's bbox
// scaled to fit, plus a rectangle representing the main viewport.
// Click-to-pan: clicking inside the minimap recenters the main camera
// on that world point; pointer-drag re-centers continuously.
//
// We deliberately don't share the main renderer's GPU pipeline — the
// minimap is dirt-cheap CPU 2D canvas, runs on every camera/store
// change at trivial cost, and avoids the entire WebGPU/WebGL parity
// matrix. The cost is keeping the minimap visually approximate (lines
// rendered as antialiased strokes, arcs as polyline approximations).
import { useEffect, useRef } from "react";
import {
  bboxOfEntity,
  listVisibleEntities,
  type BboxType,
  type Drawing,
  type Entity,
  type Vec2Type,
} from "@modcad/core";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { useViewportState } from "../state/viewportState.js";

const WIDTH = 200;
const HEIGHT = 150;
const PADDING = 4;

interface MinimapTransform {
  // World point → minimap pixel.
  toScreen(p: Vec2Type): [number, number];
  // Minimap pixel → world point.
  toWorld(x: number, y: number): Vec2Type;
  bbox: BboxType;
}

function computeBbox(drawing: Drawing): BboxType {
  const entities = listVisibleEntities(drawing);
  if (entities.length === 0) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of entities) {
    const b = bboxOfEntity(e);
    if (!b) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

function buildTransform(bbox: BboxType): MinimapTransform {
  const w = Math.max(1, bbox.maxX - bbox.minX);
  const h = Math.max(1, bbox.maxY - bbox.minY);
  const availW = WIDTH - PADDING * 2;
  const availH = HEIGHT - PADDING * 2;
  const scale = Math.min(availW / w, availH / h);
  const offX = PADDING + (availW - w * scale) / 2;
  const offY = PADDING + (availH - h * scale) / 2;
  return {
    bbox,
    toScreen: (p) => [
      offX + (p[0] - bbox.minX) * scale,
      // Flip Y so positive-Y world points display above (matches the
      // main canvas convention used in CanvasHost.screenToWorld).
      HEIGHT - (offY + (p[1] - bbox.minY) * scale),
    ],
    toWorld: (x, y) => [
      bbox.minX + (x - offX) / scale,
      bbox.minY + (HEIGHT - y - offY) / scale,
    ],
  };
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  t: MinimapTransform,
): void {
  switch (e.kind) {
    case "line": {
      const [ax, ay] = t.toScreen(e.a);
      const [bx, by] = t.toScreen(e.b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      return;
    }
    case "polyline": {
      ctx.beginPath();
      e.vertices.forEach((v, i) => {
        const [x, y] = t.toScreen(v.p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (e.closed) ctx.closePath();
      ctx.stroke();
      return;
    }
    case "circle": {
      const [cx, cy] = t.toScreen(e.c);
      const [rx] = t.toScreen([e.c[0] + e.r, e.c[1]]);
      const r = Math.max(0.5, Math.abs(rx - cx));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case "arc": {
      const [cx, cy] = t.toScreen(e.c);
      const [rx] = t.toScreen([e.c[0] + e.r, e.c[1]]);
      const r = Math.max(0.5, Math.abs(rx - cx));
      ctx.beginPath();
      // Y-flip means we sweep in the opposite direction; negating the
      // angles restores visual orientation.
      const sweep = e.endAngle - e.startAngle;
      ctx.arc(cx, cy, r, -e.startAngle, -e.endAngle, sweep > 0);
      ctx.stroke();
      return;
    }
    case "point": {
      const [x, y] = t.toScreen(e.p);
      ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      return;
    }
    default:
      return;
  }
}

export function Minimap(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<MinimapTransform | null>(null);
  const draggingRef = useRef(false);

  // Re-render whenever the drawing or the camera changes.
  const drawing = useDrawingSession((s) => {
    const slice = s.slices.find((sl) => sl.id === s.activeId);
    return slice?.drawing ?? null;
  });
  const viewport = useViewportState();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1);

    if (!drawing) {
      transformRef.current = null;
      return;
    }
    const bbox = computeBbox(drawing);
    const t = buildTransform(bbox);
    transformRef.current = t;

    ctx.strokeStyle = "rgba(180, 180, 180, 0.9)";
    ctx.lineWidth = 0.7;
    for (const e of listVisibleEntities(drawing)) {
      drawEntity(ctx, e, t);
    }

    // Viewport rectangle. Compute the screen-rect-in-world for the
    // main camera and project into minimap space.
    if (viewport.rect && viewport.zoom > 0) {
      const halfW = viewport.rect.width / 2 / viewport.zoom;
      const halfH = viewport.rect.height / 2 / viewport.zoom;
      const cx = viewport.center[0];
      const cy = viewport.center[1];
      const [x0, y0] = t.toScreen([cx - halfW, cy + halfH]);
      const [x1, y1] = t.toScreen([cx + halfW, cy - halfH]);
      ctx.strokeStyle = "rgba(255, 200, 80, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        Math.min(x0, x1),
        Math.min(y0, y1),
        Math.abs(x1 - x0),
        Math.abs(y1 - y0),
      );
    }
  }, [drawing, viewport.center, viewport.zoom, viewport.rect]);

  const recenter = (clientX: number, clientY: number): void => {
    const canvas = canvasRef.current;
    const t = transformRef.current;
    if (!canvas || !t) return;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const world = t.toWorld(localX, localY);
    // The main camera lives inside CanvasHost — we update via the
    // viewport store. CanvasHost's subscription to the store applies
    // the camera change on the next animation frame.
    useViewportState.getState().set({ center: world });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.preventDefault();
    draggingRef.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    recenter(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!draggingRef.current) return;
    recenter(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    draggingRef.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <canvas
      ref={canvasRef}
      data-testid="minimap"
      width={WIDTH}
      height={HEIGHT}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "absolute",
        right: 8,
        bottom: 8,
        width: WIDTH,
        height: HEIGHT,
        cursor: "crosshair",
        // Keep above canvas pointer events but below modal overlays.
        zIndex: 50,
        borderRadius: 4,
        boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
        touchAction: "none",
      }}
    />
  );
}
