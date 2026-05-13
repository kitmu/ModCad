// T077a — Settings → Units pane (global default).
//
// Per FR-015a/b: switching units never rescales geometry. This pane
// only writes the global default; per-drawing overrides live in
// DrawingProperties and travel with the .modcad file.
import { useState } from "react";
import type { Unit } from "@modcad/core";
import { loadDefaultUnit, saveDefaultUnit } from "./unitsPrefs.js";

const ALL: Unit[] = ["mm", "cm", "m", "in", "ft"];

export function UnitsSettings(): JSX.Element {
  const [unit, setUnit] = useState<Unit>(() => loadDefaultUnit());

  return (
    <div data-testid="units-settings" style={{ padding: 8, fontSize: 12 }}>
      <div style={{ fontWeight: 600 }}>Units</div>
      <p style={{ color: "#aaa" }}>
        Default unit for new drawings. Changing this never rescales existing
        geometry; per-drawing overrides travel with the file.
      </p>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span>Global default:</span>
        <select
          data-testid="units-global-default"
          value={unit}
          onChange={(e) => {
            const v = e.target.value as Unit;
            setUnit(v);
            saveDefaultUnit(v);
          }}
        >
          {ALL.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
