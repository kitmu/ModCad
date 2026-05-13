// CanvasHost — owns the renderer lifecycle, the camera, the rubber-band
// transient scene layer, the PointerInput adapter, and the active tool.
//
// One CanvasHost is mounted per workspace; switching tabs swaps the
// active slice underneath without remounting the renderer (avoids GPU
// context churn on tab-switch — see plan.md cross-cutting decisions).
//
// FR-020 covers pan/zoom/fit. Wheel-zoom anchors at the cursor:
//   newCenter = pivotWorld + (oldCenter - pivotWorld) / zoomDelta
// so the world point under the cursor stays under the cursor.
//
// FR-016 (file menu) is rendered by FileMenu but its keyboard shortcuts
// (Ctrl-S / Ctrl-O / Ctrl-N) are wired here so the canvas doesn't need
// focus.
//
// PointerEvents-only per Constitution; no mouse/touch handlers anywhere.
import { useEffect } from "react";
import {
  createRenderer,
  type SceneRenderer,
} from "@modcad/renderer";
import {
  listVisibleEntities,
  resolveStyle,
  type Drawing,
  type Entity,
  type Id,
  type Vec2Type,
} from "@modcad/core";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { PointerInput, type PointerSample } from "./PointerInput.js";
import { RubberBand } from "./RubberBand.js";
import { handleOrthoPolarKey } from "./OrthoPolar.js";
import { LineTool } from "../tools/LineTool.js";
import { RectangleTool } from "../tools/RectangleTool.js";
import { CircleTool } from "../tools/CircleTool.js";
import { ArcTool } from "../tools/ArcTool.js";
import { PolylineTool } from "../tools/PolylineTool.js";
import { EllipseTool } from "../tools/EllipseTool.js";
import { PointTool } from "../tools/PointTool.js";
import { MoveTool } from "../tools/MoveTool.js";
import { TrimTool } from "../tools/TrimTool.js";
import type { Tool, ToolContext } from "../tools/Tool.js";
import { saveActiveDrawing, openDrawingFromDisk } from "../files/fileActions.js";
import { commandRouter } from "../palette/commandRouter.js";
import { createSelectionController } from "./Selection.js";
import { useViewportState } from "../state/viewportState.js";

interface Camera {
  center: Vec2Type;
  zoom: number;
  rotation: number;
}

export function CanvasHost(): null {
  useEffect(() => {
    const canvas = document.getElementById("modcad-canvas") as HTMLCanvasElement | null;
    if (!canvas) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      let renderer: SceneRenderer;
      try {
        renderer = await createRenderer({ canvas });
      } catch (err) {
        // No GPU? Carry on with a noop renderer so input + state still
        // work (matters for headless e2e and accessibility-style runs).
        console.error("modcad: renderer init failed; falling back to noop", err);
        renderer = makeNoopRenderer();
      }
      if (cancelled) {
        renderer.destroy();
        return;
      }
      const rubberBand = new RubberBand();
      const camera: Camera = { center: [0, 0], zoom: 1, rotation: 0 };
      let activeTool: Tool | null = null;
      let panLast: [number, number] | null = null;
      let drawnIds = new Set<string>();
      let rafToken = 0;

      const scheduleDraw = (): void => {
        if (rafToken) return;
        rafToken = requestAnimationFrame(() => {
          rafToken = 0;
          renderer.draw();
        });
      };

      const applyCamera = (): void => {
        renderer.camera({
          center: camera.center,
          zoom: camera.zoom,
          rotation: camera.rotation,
        });
        useViewportState.getState().set({
          center: camera.center,
          zoom: camera.zoom,
        });
      };

      const screenToWorld = (screen: [number, number]): Vec2Type => {
        const rect = canvas.getBoundingClientRect();
        const px = screen[0] - rect.width / 2;
        const py = screen[1] - rect.height / 2;
        return [camera.center[0] + px / camera.zoom, camera.center[1] - py / camera.zoom];
      };

      const dpr = window.devicePixelRatio || 1;
      const fitCanvas = (): void => {
        const rect = canvas.getBoundingClientRect();
        renderer.resize(rect.width, rect.height, dpr);
        useViewportState.getState().set({
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
        });
        applyCamera();
        scheduleDraw();
      };
      const ro = new ResizeObserver(fitCanvas);
      ro.observe(canvas);
      fitCanvas();

      const syncEntities = (): void => {
        const { slices, activeId } = useDrawingSession.getState();
        const active = slices.find((s) => s.id === activeId);
        const drawing: Drawing | null = active?.drawing ?? null;
        // Resolve byLayer color/lineweight before upload so the renderer
        // never sees a placeholder. Surgical: just pre-resolve the styles;
        // entity shape is otherwise unchanged.
        const visible: Entity[] = drawing
          ? listVisibleEntities(drawing).map((e) => resolveStyle(e, drawing))
          : [];
        const transient = rubberBand.list();
        const all = [...visible, ...transient];
        const nextIds = new Set<string>(all.map((e) => e.id));
        // Stale removals.
        const removals: Id[] = [];
        for (const id of drawnIds) {
          if (!nextIds.has(id)) removals.push(id as Id);
        }
        if (removals.length > 0) renderer.remove(removals);
        if (all.length > 0) renderer.upsert(all);
        drawnIds = nextIds;
        scheduleDraw();
      };

      const fitDrawing = (): void => {
        const { slices, activeId } = useDrawingSession.getState();
        const active = slices.find((s) => s.id === activeId);
        if (!active) return;
        const ents = listVisibleEntities(active.drawing);
        if (ents.length === 0) {
          camera.center = [0, 0];
          camera.zoom = 1;
          camera.rotation = 0;
          applyCamera();
          scheduleDraw();
          return;
        }
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const eat = (p: Vec2Type): void => {
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
        };
        for (const e of ents) {
          switch (e.kind) {
            case "line":
              eat(e.a);
              eat(e.b);
              break;
            case "polyline":
              for (const v of e.vertices) eat(v.p);
              break;
            case "circle":
            case "arc":
              eat([e.c[0] - e.r, e.c[1] - e.r]);
              eat([e.c[0] + e.r, e.c[1] + e.r]);
              break;
            case "ellipse": {
              const mag = Math.hypot(e.major[0], e.major[1]);
              eat([e.c[0] - mag, e.c[1] - mag]);
              eat([e.c[0] + mag, e.c[1] + mag]);
              break;
            }
            case "point":
              eat(e.p);
              break;
            default:
              break;
          }
        }
        const rect = canvas.getBoundingClientRect();
        const w = maxX - minX || 1;
        const h = maxY - minY || 1;
        const margin = 0.9;
        camera.center = [(minX + maxX) / 2, (minY + maxY) / 2];
        camera.zoom = Math.min((rect.width * margin) / w, (rect.height * margin) / h);
        camera.rotation = 0;
        applyCamera();
        scheduleDraw();
      };

      const activateTool = (tool: Tool): void => {
        activeTool?.dispose();
        const ctx: ToolContext = {
          get bus() {
            const { slices, activeId } = useDrawingSession.getState();
            const sl = slices.find((s) => s.id === activeId);
            if (!sl) throw new Error("activateTool: no active slice");
            return sl.bus;
          },
          rubberBand,
          syncDirty: () => {
            const { activeId, syncFromBus } = useDrawingSession.getState();
            if (activeId) syncFromBus(activeId);
          },
          done: () => {
            if (activeTool === tool) activeTool = null;
          },
        };
        activeTool = tool;
        tool.start(ctx);
      };

      // Expose the active tool to the palette router so typed
      // coordinates reach `onCoordinate` and parseCoord can use the
      // tool's last committed point.
      commandRouter.setActiveToolAccessor(() => activeTool);

      // Register handlers for every command the palette can dispatch.
      // The palette/keybinding key handler hits the router; the router
      // calls these. (Pre-existing single-letter shortcuts in
      // handleGlobalKey now flow through here too.)
      commandRouter.register("draw.line", () => activateTool(new LineTool()));
      commandRouter.register("draw.rectangle", () => activateTool(new RectangleTool()));
      commandRouter.register("draw.circle", () => activateTool(new CircleTool()));
      commandRouter.register("draw.arc", () => activateTool(new ArcTool()));
      commandRouter.register("draw.polyline", () => activateTool(new PolylineTool()));
      commandRouter.register("draw.ellipse", () => activateTool(new EllipseTool()));
      commandRouter.register("draw.point", () => activateTool(new PointTool()));
      // US6 modify tools.
      commandRouter.register("modify.move", () => activateTool(new MoveTool()));
      commandRouter.register("modify.trim", () => activateTool(new TrimTool()));
      commandRouter.register("view.fit", () => fitDrawing());
      commandRouter.register("file.new", () => {
        useDrawingSession.getState().openNew();
      });
      commandRouter.register("file.open", () => {
        void openDrawingFromDisk();
      });
      commandRouter.register("file.save", () => {
        void saveActiveDrawing();
      });
      commandRouter.register("file.saveAs", () => {
        void saveActiveDrawing();
      });

      const selectionController = createSelectionController({
        getDrawing: () => {
          const { slices, activeId } = useDrawingSession.getState();
          return slices.find((s) => s.id === activeId)?.drawing ?? null;
        },
      });

      const handleGlobalKey = (e: KeyboardEvent): void => {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }
        // Tool first (it might consume Escape).
        if (activeTool) activeTool.onKeydown(e);
        // Selection-level keys: only when no tool is active.
        if (!activeTool) {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
            e.preventDefault();
            selectionController.selectAll();
            return;
          }
          if (e.key === "Escape") {
            selectionController.clear();
          }
        }
        if (handleOrthoPolarKey(e)) {
          scheduleDraw();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
          e.preventDefault();
          fitDrawing();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void saveActiveDrawing();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
          e.preventDefault();
          void openDrawingFromDisk();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
          e.preventDefault();
          useDrawingSession.getState().openNew();
          return;
        }
        // Single-letter tool shortcuts (L, R, C, …) are now owned by the
        // PaletteKeyboard + keybinding store (T068). Phase-4 onwards.
      };

      const pointer = new PointerInput({ canvas, screenToWorld });
      applyCamera();

      const isPanGesture = (s: PointerSample): boolean =>
        Boolean(s.buttons & 4) || (s.spaceHeld && Boolean(s.buttons & 1));

      let shiftDown = false;
      let ctrlDown = false;
      const trackModifiers = (e: KeyboardEvent): void => {
        shiftDown = e.shiftKey;
        ctrlDown = e.ctrlKey || e.metaKey;
      };

      const offDown = pointer.onPointerDownEvt((s) => {
        if (s.button === 1 || (s.spaceHeld && s.button === 0)) {
          panLast = s.screen;
          return;
        }
        if (activeTool) {
          activeTool.onPointerDown(s);
        } else {
          selectionController.onPointerDown(s, shiftDown, ctrlDown);
        }
      });
      const offMove = pointer.onPointerMoveEvt((s) => {
        if (isPanGesture(s)) {
          if (panLast) {
            const dx = s.screen[0] - panLast[0];
            const dy = s.screen[1] - panLast[1];
            camera.center = [
              camera.center[0] - dx / camera.zoom,
              camera.center[1] + dy / camera.zoom,
            ];
            applyCamera();
            scheduleDraw();
          }
          panLast = s.screen;
          return;
        }
        panLast = null;
        if (activeTool) {
          activeTool.onPointerMove(s);
        } else {
          selectionController.onPointerMove(s);
        }
      });
      const offUp = pointer.onPointerUpEvt((s) => {
        panLast = null;
        if (!activeTool) {
          selectionController.onPointerUp(s, shiftDown, ctrlDown);
        }
      });
      window.addEventListener("keydown", trackModifiers);
      window.addEventListener("keyup", trackModifiers);
      const offKey = pointer.onKeyDownEvt(handleGlobalKey);

      const onWheel = (e: WheelEvent): void => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const pivot: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
        const pivotWorld = screenToWorld(pivot);
        const zoomDelta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const inv = 1 / zoomDelta;
        camera.center = [
          pivotWorld[0] + (camera.center[0] - pivotWorld[0]) * inv,
          pivotWorld[1] + (camera.center[1] - pivotWorld[1]) * inv,
        ];
        camera.zoom = camera.zoom * zoomDelta;
        applyCamera();
        scheduleDraw();
      };
      canvas.addEventListener("wheel", onWheel, { passive: false });

      // Initial sync + ongoing subscriptions.
      syncEntities();
      const unsubStore = useDrawingSession.subscribe(syncEntities);
      const unsubRubber = rubberBand.subscribe(syncEntities);

      cleanup = (): void => {
        offDown();
        offMove();
        offUp();
        offKey();
        window.removeEventListener("keydown", trackModifiers);
        window.removeEventListener("keyup", trackModifiers);
        canvas.removeEventListener("wheel", onWheel);
        ro.disconnect();
        unsubStore();
        unsubRubber();
        pointer.destroy();
        if (rafToken) cancelAnimationFrame(rafToken);
        renderer.destroy();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}

/**
 * No-op renderer used when GPU init fails. Keeps the rest of the app
 * (tools, store, file menu) functional so headless tests and a11y
 * runs can still exercise the canvas surface.
 */
function makeNoopRenderer(): SceneRenderer {
  return {
    backend: "webgl2",
    upsert: () => undefined,
    remove: () => undefined,
    camera: () => undefined,
    resize: () => undefined,
    draw: () => undefined,
    pick: () => null,
    getStats: () => ({ fps: 0, drawCalls: 0, entityCount: 0, frameTimeMs: 0 }),
    on: () => () => undefined,
    destroy: () => undefined,
  };
}
