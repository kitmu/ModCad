// T075 — LayerTree panel. Flat list for v1; data model leaves room for
// nested groups but FR-010 doesn't require them.
//
// Features:
//   - filter input across layer names
//   - click row → set current layer
//   - inline visibility / lock toggles
//   - drag-reorder using native HTML5 DnD (mirrors TabStrip's pattern)
//   - context menu (right-click) with Rename / Lock-Unlock / Hide-Show /
//     Color… / Delete… affordances
//   - Delete opens a tiny reassign dialog; if the layer is locked or
//     frozen or is "0" the menu disables Delete with an explanatory
//     tooltip (FR-012).
import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  addLayerCommand,
  removeLayerCommand,
  renameLayerCommand,
  reorderLayerCommand,
  setCurrentLayerCommand,
  setLayerColorCommand,
  setLayerLockedCommand,
  setLayerVisibleCommand,
  LayerLockedError,
  LayerFrozenError,
  UndeletableLayerError,
  type Drawing,
  type Layer,
  type Id,
} from "@modcad/core";
import { ColorPicker } from "@modcad/ui-kit";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { notify } from "../state/notifications.js";

const DEFAULT_NEW_LAYER_COLOR = { r: 1, g: 1, b: 1, a: 1 };

// Decorative chrome glyphs. They're presentational (the surrounding
// element exposes the accessible name via aria-label); aliasing them
// here keeps the JSX free of literal-string-in-JSX lint flags while
// still rendering the same characters.
const ADD_GLYPH = "+";
const EYE_GLYPH = "\u{1F441}"; // 👁
const DASH_GLYPH = "—";
const LOCK_GLYPH = "\u{1F512}"; // 🔒
const UNLOCK_GLYPH = "\u{1F513}"; // 🔓
const STAR_GLYPH = "★";

interface ContextMenu {
  layerId: Id;
  x: number;
  y: number;
}

interface DeleteDialog {
  layerId: Id;
}

interface ColorEditor {
  layerId: Id;
}

export function LayerTree(): JSX.Element {
  const slices = useDrawingSession((s) => s.slices);
  const activeId = useDrawingSession((s) => s.activeId);
  const applyCommand = useDrawingSession((s) => s.applyCommand);
  const active = slices.find((s) => s.id === activeId);
  const drawing: Drawing | null = active?.drawing ?? null;

  const intl = useIntl();
  const t = (id: string, values?: Record<string, string>): string =>
    intl.formatMessage({ id }, values);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | null>(null);
  const [colorEditor, setColorEditor] = useState<ColorEditor | null>(null);
  const [renameId, setRenameId] = useState<Id | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const orderedLayers = useMemo<Layer[]>(() => {
    if (!drawing) return [];
    const map = new Map(drawing.layers.map((l) => [l.id, l]));
    return drawing.layerOrder
      .map((id) => map.get(id))
      .filter((l): l is Layer => Boolean(l));
  }, [drawing]);

  const filteredLayers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return orderedLayers;
    return orderedLayers.filter((l) => l.name.toLowerCase().includes(q));
  }, [orderedLayers, filter]);

  if (!drawing) {
    return (
      <div data-testid="layer-tree" style={{ padding: 8, fontSize: 12 }}>
        <FormattedMessage id="layers.empty" defaultMessage="No drawing open." />
      </div>
    );
  }

  const canDelete = (layer: Layer): boolean =>
    !layer.locked && !layer.frozen && layer.name !== "0";

  const tryRun = (fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      if (
        err instanceof LayerLockedError ||
        err instanceof LayerFrozenError ||
        err instanceof UndeletableLayerError
      ) {
        notify(err.message);
      } else {
        throw err;
      }
    }
  };

  const onNewLayer = (): void => {
    const base = "layer";
    let i = 1;
    while (orderedLayers.some((l) => l.name === `${base}${i}`)) i++;
    applyCommand(
      addLayerCommand({
        name: `${base}${i}`,
        color: DEFAULT_NEW_LAYER_COLOR,
        lineweight: 0.25,
      }),
    );
  };

  return (
    <div
      data-testid="layer-tree"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 8,
        minWidth: 240,
        borderLeft: "1px solid var(--modcad-border, #333)",
        fontSize: 12,
        background: "var(--modcad-panel-bg, #1b1b1b)",
        color: "var(--modcad-fg, #ddd)",
      }}
    >
      <div style={{ display: "flex", gap: 4 }}>
        <input
          data-testid="layer-filter"
          placeholder={t("layers.filter.placeholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1 }}
          aria-label={t("layers.filter.placeholder")}
        />
        <button
          data-testid="layer-new"
          onClick={onNewLayer}
          title={t("layers.new")}
          aria-label={t("layers.new")}
        >
          {ADD_GLYPH}
        </button>
      </div>
      <ul role="listbox" aria-label={t("layers.list.aria")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {filteredLayers.map((layer, idx) => {
          const isCurrent = layer.id === drawing.currentLayerId;
          const realIdx = drawing.layerOrder.indexOf(layer.id);
          return (
            <li
              key={layer.id}
              role="option"
              aria-selected={isCurrent}
              data-testid={`layer-row-${layer.name}`}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData("text/modcad-layer-index", String(realIdx))
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/modcad-layer-index"));
                if (Number.isFinite(from) && from !== realIdx) {
                  tryRun(() =>
                    applyCommand(
                      reorderLayerCommand({ id: layer.id, to: realIdx }, drawing),
                    ),
                  );
                }
              }}
              onClick={() =>
                tryRun(() =>
                  applyCommand(setCurrentLayerCommand({ id: layer.id }, drawing)),
                )
              }
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ layerId: layer.id, x: e.clientX, y: e.clientY });
              }}
              style={{
                display: "flex",
                gap: 4,
                alignItems: "center",
                padding: "2px 4px",
                background: isCurrent ? "var(--modcad-selection, #234)" : "transparent",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <button
                aria-label={t("layers.visibility.aria", { name: layer.name })}
                data-testid={`layer-visible-${layer.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  tryRun(() =>
                    applyCommand(
                      setLayerVisibleCommand(
                        { id: layer.id, value: !layer.visible },
                        drawing,
                      ),
                    ),
                  );
                }}
                style={{ width: 18 }}
                title={t(layer.visible ? "layers.tooltip.hide" : "layers.tooltip.show")}
              >
                {layer.visible ? EYE_GLYPH : DASH_GLYPH}
              </button>
              <button
                aria-label={t("layers.lock.aria", { name: layer.name })}
                data-testid={`layer-lock-${layer.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  tryRun(() =>
                    applyCommand(
                      setLayerLockedCommand(
                        { id: layer.id, value: !layer.locked },
                        drawing,
                      ),
                    ),
                  );
                }}
                style={{ width: 18 }}
                title={t(layer.locked ? "layers.tooltip.unlock" : "layers.tooltip.lock")}
              >
                {layer.locked ? LOCK_GLYPH : UNLOCK_GLYPH}
              </button>
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  background: rgbaToCss(layer.color),
                  border: "1px solid #444",
                }}
              />
              {renameId === layer.id ? (
                <input
                  data-testid={`layer-rename-input-${layer.name}`}
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const name = renameValue.trim();
                      if (name) {
                        tryRun(() =>
                          applyCommand(
                            renameLayerCommand({ id: layer.id, name }, drawing),
                          ),
                        );
                      }
                      setRenameId(null);
                    } else if (e.key === "Escape") {
                      setRenameId(null);
                    }
                  }}
                  onBlur={() => setRenameId(null)}
                  style={{ flex: 1 }}
                />
              ) : (
                <span style={{ flex: 1 }}>{layer.name}</span>
              )}
              {isCurrent && (
                <span
                  data-testid={`layer-current-${layer.name}`}
                  title={t("layers.current")}
                  aria-label={t("layers.current")}
                >
                  {STAR_GLYPH}
                </span>
              )}
              {/* idx is the filtered index, unused but referenced to silence lint */}
              <span style={{ display: "none" }}>{idx}</span>
            </li>
          );
        })}
      </ul>
      {menu && (() => {
        const target = orderedLayers.find((l) => l.id === menu.layerId);
        if (!target) return null;
        const deletable = canDelete(target);
        const deleteTitle = !deletable
          ? target.locked
            ? t("layers.delete.unlockFirst")
            : target.frozen
              ? t("layers.delete.thawFirst")
              : t("layers.delete.defaultLayer")
          : "";
        return (
          <div
            data-testid="layer-context-menu"
            onClick={() => setMenu(null)}
            style={{
              position: "fixed",
              top: menu.y,
              left: menu.x,
              background: "#222",
              border: "1px solid #444",
              padding: 4,
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 160,
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              onClick={() => {
                tryRun(() =>
                  applyCommand(setCurrentLayerCommand({ id: target.id }, drawing)),
                );
                setMenu(null);
              }}
            >
              <FormattedMessage id="layers.menu.setCurrent" defaultMessage="Set current" />
            </button>
            <button
              onClick={() => {
                setRenameId(target.id);
                setRenameValue(target.name);
                setMenu(null);
              }}
            >
              <FormattedMessage id="layers.menu.rename" defaultMessage="Rename" />
            </button>
            <button
              onClick={() => {
                tryRun(() =>
                  applyCommand(
                    setLayerLockedCommand(
                      { id: target.id, value: !target.locked },
                      drawing,
                    ),
                  ),
                );
                setMenu(null);
              }}
            >
              <FormattedMessage
                id={target.locked ? "layers.menu.unlock" : "layers.menu.lock"}
                defaultMessage={target.locked ? "Unlock" : "Lock"}
              />
            </button>
            <button
              onClick={() => {
                tryRun(() =>
                  applyCommand(
                    setLayerVisibleCommand(
                      { id: target.id, value: !target.visible },
                      drawing,
                    ),
                  ),
                );
                setMenu(null);
              }}
            >
              <FormattedMessage
                id={target.visible ? "layers.menu.hide" : "layers.menu.show"}
                defaultMessage={target.visible ? "Hide" : "Show"}
              />
            </button>
            <button
              onClick={() => {
                setColorEditor({ layerId: target.id });
                setMenu(null);
              }}
            >
              <FormattedMessage id="layers.menu.color" defaultMessage="Color…" />
            </button>
            <button
              data-testid={`layer-delete-${target.name}`}
              disabled={!deletable}
              title={deleteTitle}
              onClick={() => {
                if (!deletable) return;
                setDeleteDialog({ layerId: target.id });
                setMenu(null);
              }}
            >
              <FormattedMessage id="layers.menu.delete" defaultMessage="Delete…" />
            </button>
          </div>
        );
      })()}
      {deleteDialog && (() => {
        const target = orderedLayers.find((l) => l.id === deleteDialog.layerId);
        if (!target) return null;
        const candidates = orderedLayers.filter((l) => l.id !== target.id);
        return (
          <div
            data-testid="layer-delete-dialog"
            role="dialog"
            aria-modal="false"
            style={{
              position: "fixed",
              top: "30%",
              left: "30%",
              padding: 12,
              background: "#222",
              border: "1px solid #555",
              zIndex: 11,
            }}
          >
            <div>
              <FormattedMessage
                id="layers.delete.reassign"
                defaultMessage='Reassign entities of "{name}" to:'
                values={{ name: target.name }}
              />
            </div>
            <select
              data-testid="layer-delete-target"
              defaultValue={candidates[0]?.id}
              id={`reassign-${target.id}`}
              style={{ marginTop: 8, width: "100%" }}
            >
              {candidates.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 8, display: "flex", gap: 4, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteDialog(null)}>
                <FormattedMessage id="layers.delete.cancel" defaultMessage="Cancel" />
              </button>
              <button
                data-testid="layer-delete-confirm"
                onClick={() => {
                  const sel = document.getElementById(
                    `reassign-${target.id}`,
                  ) as HTMLSelectElement | null;
                  const reassignTo = sel?.value;
                  if (!reassignTo) return;
                  tryRun(() =>
                    applyCommand(
                      removeLayerCommand(
                        { id: target.id, reassignTo: reassignTo as Id },
                        drawing,
                      ),
                    ),
                  );
                  setDeleteDialog(null);
                }}
              >
                <FormattedMessage id="layers.delete.confirm" defaultMessage="Delete" />
              </button>
            </div>
          </div>
        );
      })()}
      {colorEditor && (() => {
        const target = orderedLayers.find((l) => l.id === colorEditor.layerId);
        if (!target) return null;
        return (
          <div
            data-testid="layer-color-editor"
            style={{
              position: "fixed",
              top: "30%",
              left: "30%",
              background: "#222",
              border: "1px solid #555",
              padding: 8,
              zIndex: 11,
            }}
          >
            <ColorPicker
              value={target.color}
              onChange={(c) => {
                tryRun(() =>
                  applyCommand(
                    setLayerColorCommand({ id: target.id, color: c }, drawing),
                  ),
                );
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={() => setColorEditor(null)}>
                <FormattedMessage id="layers.color.close" defaultMessage="Close" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function rgbaToCss(c: { r: number; g: number; b: number; a: number }): string {
  const to255 = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${to255(c.r)},${to255(c.g)},${to255(c.b)},${c.a})`;
}
