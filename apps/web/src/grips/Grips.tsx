// US6 — Grip rendering, hit-testing, and drag-commit.
//
// FR-025a: each selected entity exposes grips at meaningful points
// (endpoints, midpoints, centers, vertex anchors). FR-025b: hovering a
// grip surfaces a contextual mini-toolbar (GripToolbar).
//
// Rendering: positioned absolutely on top of the canvas in a fixed
// world→screen mapping read from the same CanvasHost as the renderer.
// We deliberately do NOT submit grips through the GPU renderer — they
// live in DOM so the mini-toolbar can be a real interactive element
// and so headless e2e tests can click them via Playwright.
//
// Drag commit: pointer-down on a grip starts the drag; pointermove
// updates the local preview position; pointer-up commits a single
// `modifyGeometryCommand` per FR-006's "every committed mutation goes
// through the bus" rule.
import { useState } from "react";
import { useIntl } from "react-intl";
import {
  modifyGeometryCommand,
  type Entity,
  type GeometryMember,
  type Id,
  type Vec2Type,
} from "@modcad/core";
import { useSelection } from "../state/selection.js";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { useViewportState } from "../state/viewportState.js";
import { GripToolbar, type GripToolbarOption } from "./GripToolbar.js";

export interface GripSpec {
  entityId: Id;
  member: GeometryMember;
  position: Vec2Type;
  /** Kind for styling + mini-toolbar dispatch. */
  kind:
    | "endpoint"
    | "midpoint"
    | "vertex"
    | "center"
    | "quadrant"
    | "anchor";
}

function gripsForEntity(e: Entity): GripSpec[] {
  switch (e.kind) {
    case "line": {
      const mid: Vec2Type = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
      return [
        { entityId: e.id as Id, member: "a", position: e.a, kind: "endpoint" },
        { entityId: e.id as Id, member: "b", position: e.b, kind: "endpoint" },
        // Midpoint grip doesn't bind to a single member; the renderer
        // marks it so the mini-toolbar can offer the "stretch" option.
        // For v1 we don't commit drags on midpoint — picking it does
        // nothing per US6 acceptance.
        {
          entityId: e.id as Id,
          member: "a",
          position: mid,
          kind: "midpoint",
        },
      ];
    }
    case "polyline": {
      const grips: GripSpec[] = [];
      e.vertices.forEach((v, i) => {
        grips.push({
          entityId: e.id as Id,
          member: { vertexIndex: i },
          position: v.p,
          kind: "vertex",
        });
      });
      return grips;
    }
    case "circle": {
      const r = e.r;
      const quads: Vec2Type[] = [
        [e.c[0] + r, e.c[1]],
        [e.c[0], e.c[1] + r],
        [e.c[0] - r, e.c[1]],
        [e.c[0], e.c[1] - r],
      ];
      return [
        { entityId: e.id as Id, member: "c", position: e.c, kind: "center" },
        ...quads.map<GripSpec>((p) => ({
          entityId: e.id as Id,
          member: "r",
          position: p,
          kind: "quadrant",
        })),
      ];
    }
    case "arc": {
      const start: Vec2Type = [
        e.c[0] + e.r * Math.cos(e.startAngle),
        e.c[1] + e.r * Math.sin(e.startAngle),
      ];
      const end: Vec2Type = [
        e.c[0] + e.r * Math.cos(e.endAngle),
        e.c[1] + e.r * Math.sin(e.endAngle),
      ];
      const midAng = (e.startAngle + e.endAngle) / 2;
      const mid: Vec2Type = [
        e.c[0] + e.r * Math.cos(midAng),
        e.c[1] + e.r * Math.sin(midAng),
      ];
      return [
        { entityId: e.id as Id, member: "c", position: e.c, kind: "center" },
        {
          entityId: e.id as Id,
          member: "start",
          position: start,
          kind: "endpoint",
        },
        { entityId: e.id as Id, member: "end", position: end, kind: "endpoint" },
        { entityId: e.id as Id, member: "c", position: mid, kind: "midpoint" },
      ];
    }
    case "text":
      return [
        {
          entityId: e.id as Id,
          member: "anchor",
          position: e.anchor,
          kind: "anchor",
        },
      ];
    case "point":
    case "ellipse":
    case "dimension":
    default:
      // v1 grips for these are deferred; the dim system grips are
      // sketched in the spec but not on the US6 P2 hot path.
      return [];
  }
}

interface ScreenRect {
  width: number;
  height: number;
}

/** Convert a world point to a CSS-pixel offset relative to the canvas. */
function worldToScreen(
  p: Vec2Type,
  center: Vec2Type,
  zoom: number,
  rect: ScreenRect,
): { left: number; top: number } {
  const cx = (p[0] - center[0]) * zoom + rect.width / 2;
  // Canvas Y is inverted from world Y.
  const cy = -(p[1] - center[1]) * zoom + rect.height / 2;
  return { left: cx, top: cy };
}

export function Grips(): JSX.Element {
  const slices = useDrawingSession((s) => s.slices);
  const activeId = useDrawingSession((s) => s.activeId);
  const bySlice = useSelection((s) => s.bySlice);
  const selection: ReadonlyArray<Id> = activeId ? bySlice[activeId] ?? [] : [];
  const center = useViewportState((s) => s.center);
  const zoom = useViewportState((s) => s.zoom);
  const rect = useViewportState((s) => s.rect);
  const [hoverGrip, setHoverGrip] = useState<GripSpec | null>(null);
  const [dragGrip, setDragGrip] = useState<GripSpec | null>(null);
  const intl = useIntl();
  const fmt = (id: string): string => intl.formatMessage({ id });

  const active = slices.find((s) => s.id === activeId);
  if (!active) return <div data-testid="grips" style={{ display: "none" }} />;
  const drawing = active.drawing;
  if (!rect) return <div data-testid="grips" style={{ display: "none" }} />;
  const grips: GripSpec[] = [];
  for (const id of selection) {
    const e = drawing.entities[id];
    if (e) grips.push(...gripsForEntity(e));
  }

  const commitDrag = (grip: GripSpec, newWorld: Vec2Type): void => {
    active.bus.execute(
      modifyGeometryCommand({
        entityId: grip.entityId,
        member: grip.member,
        newValue: newWorld,
      }),
    );
    useDrawingSession.getState().syncFromBus(active.id);
  };

  const onGripDown = (grip: GripSpec, e: React.PointerEvent): void => {
    e.stopPropagation();
    setDragGrip(grip);
    const onMove = (_ev: PointerEvent): void => undefined;
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const vp = useViewportState.getState();
      const r = vp.rect;
      if (!r) return;
      const x = ev.clientX - r.left;
      const y = ev.clientY - r.top;
      const world: Vec2Type = [
        vp.center[0] + (x - r.width / 2) / vp.zoom,
        vp.center[1] - (y - r.height / 2) / vp.zoom,
      ];
      commitDrag(grip, world);
      setDragGrip(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const miniToolbarOptions = (grip: GripSpec | null): GripToolbarOption[] => {
    if (!grip) return [];
    const ent = drawing.entities[grip.entityId];
    if (!ent) return [];
    if (ent.kind === "polyline" && grip.kind === "vertex") {
      return [
        { id: "to-arc", label: fmt("grip.toarc") },
        { id: "to-line", label: fmt("grip.toline") },
        { id: "add-vertex", label: fmt("grip.addvertex") },
        { id: "remove-vertex", label: fmt("grip.removevertex") },
      ];
    }
    if (ent.kind === "arc" && grip.kind === "midpoint") {
      return [
        { id: "change-radius", label: fmt("grip.changeradius") },
        { id: "reverse", label: fmt("grip.reverse") },
      ];
    }
    if (ent.kind === "dimension") {
      return [
        { id: "repick", label: fmt("grip.repick") },
        { id: "flip-side", label: fmt("grip.flipside") },
      ];
    }
    return [];
  };

  return (
    <div
      data-testid="grips"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {grips.map((g, i) => {
        const pos = worldToScreen(g.position, center, zoom, rect);
        const isHover = hoverGrip === g;
        const isDrag = dragGrip === g;
        const size = 8;
        return (
          <div
            key={`${g.entityId}-${i}`}
            data-testid={`grip-${g.kind}`}
            data-grip-entity={g.entityId}
            onPointerEnter={() => setHoverGrip(g)}
            onPointerLeave={() => setHoverGrip((h) => (h === g ? null : h))}
            onPointerDown={(e) => onGripDown(g, e)}
            style={{
              position: "absolute",
              left: pos.left - size / 2,
              top: pos.top - size / 2,
              width: size,
              height: size,
              background: isDrag ? "#ff6" : isHover ? "#9cf" : "#3af",
              border: "1px solid #036",
              pointerEvents: "auto",
              cursor: "pointer",
            }}
          />
        );
      })}
      {hoverGrip && miniToolbarOptions(hoverGrip).length > 0 && (
        <GripToolbar
          options={miniToolbarOptions(hoverGrip)}
          anchor={worldToScreen(hoverGrip.position, center, zoom, rect)}
        />
      )}
    </div>
  );
}
