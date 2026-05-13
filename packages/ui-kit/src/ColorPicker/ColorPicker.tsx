// T074 — ColorPicker. v1 surface:
//   - 17×15 ACI 1..255 grid (255 swatches across 17 columns)
//   - true-color RGBA hex input
//   - project swatches row (up to 16 recents), persisted to localStorage
//     until the IDB prefs wrapper lands (see swatchStore.ts).
//
// Headless-friendly: callers pass `value` + `onChange`; no internal
// modal/popover behavior is assumed. Compose into a popover yourself.
import { useEffect, useState } from "react";
import { aciAll, type RGBA } from "./aciPalette.js";
import { loadSwatches, rememberSwatch } from "./swatchStore.js";

export interface ColorPickerProps {
  value: RGBA;
  onChange: (c: RGBA) => void;
  // Show a "byLayer" toggle row above the swatches. The picker still
  // emits an RGBA on swatch click; the parent component is responsible
  // for translating between byLayer and concrete colors.
  showByLayer?: boolean;
  onByLayer?: () => void;
}

function toHex(c: RGBA): string {
  const to255 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const h = (n: number): string => n.toString(16).padStart(2, "0");
  return `#${h(to255(c.r))}${h(to255(c.g))}${h(to255(c.b))}`;
}

function fromHex(hex: string): RGBA | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
    a: 1,
  };
}

export function ColorPicker({
  value,
  onChange,
  showByLayer,
  onByLayer,
}: ColorPickerProps): JSX.Element {
  const [hex, setHex] = useState(() => toHex(value));
  const [swatches, setSwatches] = useState<RGBA[]>(() => loadSwatches());

  // Keep hex input in sync when the parent updates value.
  useEffect(() => {
    setHex(toHex(value));
  }, [value]);

  const commit = (c: RGBA): void => {
    onChange(c);
    setSwatches(rememberSwatch(c));
  };

  const palette = aciAll();

  return (
    <div
      data-testid="color-picker"
      // TODO(T046): move raw strings behind the i18n wrapper.
      role="group"
      aria-label="Color picker"
      style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}
    >
      {showByLayer && (
        <button
          type="button"
          data-testid="color-by-layer"
          onClick={onByLayer}
          style={{ alignSelf: "flex-start" }}
        >
          byLayer
        </button>
      )}
      <div
        data-testid="aci-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(17, 14px)",
          gap: 2,
        }}
      >
        {palette.map((c, i) => {
          const aciIndex = i + 1;
          const bg = toHex(c);
          return (
            <button
              key={aciIndex}
              type="button"
              title={`ACI ${aciIndex}`}
              aria-label={`ACI ${aciIndex}`}
              data-aci={aciIndex}
              onClick={() => commit(c)}
              style={{
                width: 14,
                height: 14,
                background: bg,
                border: "1px solid #222",
                padding: 0,
                cursor: "pointer",
              }}
            />
          );
        })}
      </div>
      <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: 12 }}>Hex</span>
        <input
          data-testid="color-hex"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onBlur={() => {
            const parsed = fromHex(hex);
            if (parsed) commit(parsed);
            else setHex(toHex(value));
          }}
          style={{ width: 88 }}
        />
      </label>
      {swatches.length > 0 && (
        <div data-testid="recent-swatches" style={{ display: "flex", gap: 4 }}>
          {swatches.map((c, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Recent ${i + 1}`}
              onClick={() => commit(c)}
              style={{
                width: 16,
                height: 16,
                background: toHex(c),
                border: "1px solid #444",
                padding: 0,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
