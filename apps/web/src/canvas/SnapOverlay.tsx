// T080 — SnapOverlay. DOM-rendered marker + mode label + inline
// distance/angle measurement (FR-008b). Hard candidates render as a
// filled square; soft candidates use a dashed outline. The label
// names the mode (endpoint, midpoint, …).
//
// Sits in the same DOM-overlay band as Grips: absolutely positioned
// inside the canvas container, driven by `viewportState` for
// world→screen. No GPU resources, no React state churn — re-renders
// only when `useSnapState` emits.
import { useSnapState } from "../state/snapState.js";
import { useViewportState } from "../state/viewportState.js";
import type { Vec2Type } from "@modcad/core";

function worldToScreen(
  p: Vec2Type,
  center: Vec2Type,
  zoom: number,
  rect: { width: number; height: number },
): { left: number; top: number } {
  const cx = (p[0] - center[0]) * zoom + rect.width / 2;
  const cy = -(p[1] - center[1]) * zoom + rect.height / 2;
  return { left: cx, top: cy };
}

const MARKER_PX = 14;

export function SnapOverlay(): JSX.Element {
  const marker = useSnapState((s) => s.marker);
  const center = useViewportState((s) => s.center);
  const zoom = useViewportState((s) => s.zoom);
  const rect = useViewportState((s) => s.rect);

  if (!marker || !rect) {
    return <div data-testid="snap-overlay" style={{ display: "none" }} />;
  }

  const screen = worldToScreen(marker.point, center, zoom, rect);
  const isHard = marker.strength === "hard";
  const color = isHard ? "#ffaa00" : "#88aaff";
  const border = isHard ? `2px solid ${color}` : `2px dashed ${color}`;
  const background = isHard ? `${color}33` : "transparent";

  // Inline measurement (FR-008b). When the tool has a previous
  // committed point, show distance + angle from it to the snap point.
  let measurement: string | null = null;
  if (marker.lastCommittedPoint) {
    const dx = marker.point[0] - marker.lastCommittedPoint[0];
    const dy = marker.point[1] - marker.lastCommittedPoint[1];
    const d = Math.hypot(dx, dy);
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    measurement = `${d.toFixed(2)} @ ${a.toFixed(1)}°`;
  }

  return (
    <div
      data-testid="snap-overlay"
      data-snap-mode={marker.mode}
      data-snap-strength={marker.strength}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <div
        data-testid="snap-marker"
        style={{
          position: "absolute",
          left: screen.left - MARKER_PX / 2,
          top: screen.top - MARKER_PX / 2,
          width: MARKER_PX,
          height: MARKER_PX,
          border,
          background,
          boxSizing: "border-box",
        }}
      />
      <div
        data-testid="snap-label"
        style={{
          position: "absolute",
          left: screen.left + MARKER_PX,
          top: screen.top - MARKER_PX,
          color,
          fontSize: 11,
          fontFamily: "monospace",
          textShadow: "0 0 2px rgba(0,0,0,0.8)",
          whiteSpace: "nowrap",
        }}
      >
        {marker.mode}
      </div>
      {measurement && (
        <div
          data-testid="snap-measurement"
          style={{
            position: "absolute",
            left: screen.left + MARKER_PX,
            top: screen.top,
            color: "#fff",
            fontSize: 11,
            fontFamily: "monospace",
            textShadow: "0 0 2px rgba(0,0,0,0.8)",
            whiteSpace: "nowrap",
          }}
        >
          {measurement}
        </div>
      )}
    </div>
  );
}
