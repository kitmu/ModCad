// T077a — Drawing → Properties → Units (per-drawing override).
//
// The per-drawing units value is part of the Drawing record (see
// data-model.md) and thus travels with the .modcad file. Switching
// units never rescales geometry (FR-015b) — coordinate values stay
// numerically identical; only display formatting changes.
import { changeUnitsCommand, type Unit } from "@modcad/core";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";

const ALL: Unit[] = ["mm", "cm", "m", "in", "ft"];

export function DrawingProperties(): JSX.Element {
  const slices = useDrawingSession((s) => s.slices);
  const activeId = useDrawingSession((s) => s.activeId);
  const applyCommand = useDrawingSession((s) => s.applyCommand);
  const active = slices.find((s) => s.id === activeId);

  if (!active) {
    return (
      <div data-testid="drawing-properties" style={{ padding: 8, fontSize: 12 }}>
        No drawing open.
      </div>
    );
  }

  const drawing = active.drawing;

  return (
    <div data-testid="drawing-properties" style={{ padding: 8, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Drawing properties</div>
      <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
        <span>Units:</span>
        <select
          data-testid="drawing-units"
          value={drawing.units}
          onChange={(e) => {
            const v = e.target.value as Unit;
            applyCommand(changeUnitsCommand({ units: v }, drawing));
          }}
        >
          {ALL.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
        <span>Precision:</span>
        <input
          data-testid="drawing-precision"
          type="number"
          min={0}
          max={6}
          step={1}
          value={drawing.precision}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            applyCommand(
              changeUnitsCommand({ units: drawing.units, precision: v }, drawing),
            );
          }}
          style={{ width: 60 }}
        />
      </label>
    </div>
  );
}
