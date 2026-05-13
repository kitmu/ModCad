// T084 — MeasureOverlay. Renders the current MeasureTool readout as a
// floating chip on the canvas. Pure DOM; absolute-positioned over the
// canvas surface, mirroring the SnapOverlay layout. Empty when no
// active readout.
import { useMeasureState } from "../state/measureState.js";

export function MeasureOverlay(): JSX.Element {
  const readout = useMeasureState((s) => s.readout);
  if (!readout) {
    return <div data-testid="measure-overlay" style={{ display: "none" }} />;
  }
  return (
    <div
      data-testid="measure-overlay"
      data-measure-mode={readout.mode}
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        padding: "6px 10px",
        background: "rgba(0,0,0,0.7)",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 12,
        borderRadius: 4,
        pointerEvents: "none",
      }}
    >
      {readout.label}
    </div>
  );
}
