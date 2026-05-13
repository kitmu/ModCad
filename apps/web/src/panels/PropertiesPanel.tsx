/* eslint-disable formatjs/no-literal-string-in-jsx -- T046b sweep pending: messages registered in en.json will replace literals here in v1.1. */
// T076 — PropertiesPanel.
//
// Reads selection from `useSelection`. For a single-selection (v1), the
// panel exposes the entity's layer, color, and lineweight; mutations
// route through the command bus. Multi-selection displays "varies" for
// any field that isn't uniform.
import { useMemo, useState } from "react";
import {
  LayerFrozenError,
  LayerLockedError,
  setEntityColorCommand,
  setEntityLayerCommand,
  setEntityLineweightCommand,
  type ColorRef,
  type Drawing,
  type Entity,
  type Id,
  type LineweightRef,
  type RGBA,
} from "@modcad/core";
import { ColorPicker } from "@modcad/ui-kit";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { useSelection } from "../state/selection.js";
import { notify } from "../state/notifications.js";

const VARIES = "varies";
const NONE = "—";

function describeColor(c: ColorRef): string {
  if (c === "byLayer") return "byLayer";
  const to255 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `#${to255(c.r).toString(16).padStart(2, "0")}${to255(c.g)
    .toString(16)
    .padStart(2, "0")}${to255(c.b).toString(16).padStart(2, "0")}`;
}

function describeLineweight(lw: LineweightRef): string {
  if (lw === "byLayer") return "byLayer";
  return `${lw} mm`;
}

interface UnifiedFields {
  layerId: Id | typeof VARIES | null;
  color: ColorRef | typeof VARIES | null;
  lineweight: LineweightRef | typeof VARIES | null;
}

function unify(entities: Entity[]): UnifiedFields {
  if (entities.length === 0) {
    return { layerId: null, color: null, lineweight: null };
  }
  const first = entities[0]!;
  let layerId: Id | typeof VARIES = first.layerId;
  let color: ColorRef | typeof VARIES = first.color;
  let lineweight: LineweightRef | typeof VARIES = first.lineweight;
  for (let i = 1; i < entities.length; i++) {
    const e = entities[i]!;
    if (layerId !== VARIES && e.layerId !== layerId) layerId = VARIES;
    if (color !== VARIES && !colorEq(e.color, color)) color = VARIES;
    if (lineweight !== VARIES && e.lineweight !== lineweight) lineweight = VARIES;
  }
  return { layerId, color, lineweight };
}

function colorEq(a: ColorRef, b: ColorRef): boolean {
  if (a === "byLayer" || b === "byLayer") return a === b;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

export function PropertiesPanel(): JSX.Element {
  const slices = useDrawingSession((s) => s.slices);
  const activeId = useDrawingSession((s) => s.activeId);
  const applyCommand = useDrawingSession((s) => s.applyCommand);
  const selBySlice = useSelection((s) => s.bySlice);

  const active = slices.find((s) => s.id === activeId);
  const drawing: Drawing | null = active?.drawing ?? null;
  const selectedIds = activeId ? (selBySlice[activeId] ?? []) : [];

  const entities = useMemo<Entity[]>(() => {
    if (!drawing) return [];
    return selectedIds
      .map((id) => drawing.entities[id])
      .filter((e): e is Entity => Boolean(e));
  }, [drawing, selectedIds]);

  const [showColor, setShowColor] = useState(false);

  if (!drawing) {
    return (
      <div data-testid="properties-panel" style={panelStyle}>
        No drawing open.
      </div>
    );
  }

  const fields = unify(entities);

  const runMutation = (fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      if (err instanceof LayerLockedError || err instanceof LayerFrozenError) {
        notify(err.message);
      } else {
        throw err;
      }
    }
  };

  const handleLayerChange = (layerId: Id): void => {
    for (const e of entities) {
      runMutation(() =>
        applyCommand(
          setEntityLayerCommand({ entityId: e.id, layerId }, drawing),
        ),
      );
    }
  };

  const handleColorChange = (color: ColorRef): void => {
    for (const e of entities) {
      runMutation(() =>
        applyCommand(setEntityColorCommand({ entityId: e.id, color }, drawing)),
      );
    }
  };

  const handleLineweightChange = (lw: LineweightRef): void => {
    for (const e of entities) {
      runMutation(() =>
        applyCommand(
          setEntityLineweightCommand({ entityId: e.id, lineweight: lw }, drawing),
        ),
      );
    }
  };

  return (
    <div data-testid="properties-panel" style={panelStyle}>
      <div style={{ fontWeight: 600 }}>Properties</div>
      <div data-testid="property-selection-count">
        Selected: {entities.length}
      </div>
      <Row label="Layer">
        {fields.layerId === null ? (
          <span>{NONE}</span>
        ) : fields.layerId === VARIES ? (
          <span>{VARIES}</span>
        ) : (
          <select
            data-testid="property-layer"
            value={fields.layerId}
            onChange={(e) => handleLayerChange(e.target.value as Id)}
          >
            {drawing.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </Row>
      <Row label="Color">
        {fields.color === null ? (
          <span>{NONE}</span>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span data-testid="property-color-label">
              {fields.color === VARIES ? VARIES : describeColor(fields.color)}
            </span>
            <button
              data-testid="property-color-byLayer"
              onClick={() => handleColorChange("byLayer")}
            >
              byLayer
            </button>
            <button
              data-testid="property-color-edit"
              onClick={() => setShowColor((s) => !s)}
            >
              Pick…
            </button>
          </div>
        )}
      </Row>
      {showColor && fields.color !== null && (
        <ColorPicker
          value={
            fields.color === VARIES || fields.color === "byLayer"
              ? ({ r: 1, g: 1, b: 1, a: 1 } as RGBA)
              : fields.color
          }
          onChange={(c) => handleColorChange(c)}
        />
      )}
      <Row label="Lineweight">
        {fields.lineweight === null ? (
          <span>{NONE}</span>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span data-testid="property-lineweight-label">
              {fields.lineweight === VARIES
                ? VARIES
                : describeLineweight(fields.lineweight)}
            </span>
            <button
              data-testid="property-lineweight-byLayer"
              onClick={() => handleLineweightChange("byLayer")}
            >
              byLayer
            </button>
            <input
              data-testid="property-lineweight-input"
              type="number"
              step="0.05"
              min="0"
              defaultValue={
                fields.lineweight === VARIES || fields.lineweight === "byLayer"
                  ? ""
                  : String(fields.lineweight)
              }
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0) handleLineweightChange(v);
              }}
              style={{ width: 64 }}
            />
          </div>
        )}
      </Row>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 80, color: "#bbb" }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 8,
  fontSize: 12,
  minWidth: 240,
  borderLeft: "1px solid var(--modcad-border, #333)",
  background: "var(--modcad-panel-bg, #1b1b1b)",
  color: "var(--modcad-fg, #ddd)",
};
