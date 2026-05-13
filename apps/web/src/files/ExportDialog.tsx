// FR-018: export dialog. Drives format, paper size, orientation, and
// layer filtering for SVG / PDF / DXF export. Backed by the
// `exportActiveDrawing` action.
import { useMemo, useState } from "react";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { exportActiveDrawing, type ExportFormat } from "./fileActions.js";

type PaperOption = "A4" | "Letter" | "A3" | "Custom";

interface CustomSize {
  w: number;
  h: number;
}

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps): JSX.Element | null {
  const active = useDrawingSession((s) => s.slices.find((sl) => sl.id === s.activeId));
  const layers = active?.drawing.layers ?? [];

  const [format, setFormat] = useState<ExportFormat>("svg");
  const [paper, setPaper] = useState<PaperOption>("A4");
  const [custom, setCustom] = useState<CustomSize>({ w: 210, h: 297 });
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(
    () => new Set(layers.map((l) => l.id)),
  );

  const layerIds = useMemo(() => Array.from(selectedLayerIds), [selectedLayerIds]);

  if (!open) return null;

  const toggleLayer = (id: string): void => {
    setSelectedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onExport = async (): Promise<void> => {
    const opts: Parameters<typeof exportActiveDrawing>[0] = {
      format,
      orientation,
      layerIds,
    };
    if (format === "pdf") {
      opts.paperSize = paper === "Custom" ? [custom.w, custom.h] : paper;
    }
    await exportActiveDrawing(opts);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="export-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: "var(--modcad-bg, #1c1c1c)",
          color: "#eee",
          border: "1px solid #333",
          padding: 16,
          minWidth: 360,
          fontSize: 13,
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 14 }}>Export drawing</h2>

        <label style={{ display: "block", margin: "8px 0" }}>
          Format
          <select
            data-testid="export-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            style={{ marginLeft: 8 }}
          >
            <option value="dxf">DXF</option>
            <option value="svg">SVG</option>
            <option value="pdf">PDF</option>
          </select>
        </label>

        {format === "pdf" ? (
          <>
            <label style={{ display: "block", margin: "8px 0" }}>
              Paper size
              <select
                data-testid="export-paper"
                value={paper}
                onChange={(e) => setPaper(e.target.value as PaperOption)}
                style={{ marginLeft: 8 }}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="A3">A3</option>
                <option value="Custom">Custom…</option>
              </select>
            </label>

            {paper === "Custom" ? (
              <label style={{ display: "block", margin: "8px 0" }}>
                Custom size (mm)
                <input
                  data-testid="export-custom-w"
                  type="number"
                  value={custom.w}
                  onChange={(e) => setCustom((s) => ({ ...s, w: Number(e.target.value) }))}
                  style={{ width: 60, marginLeft: 8 }}
                />
                {" × "}
                <input
                  data-testid="export-custom-h"
                  type="number"
                  value={custom.h}
                  onChange={(e) => setCustom((s) => ({ ...s, h: Number(e.target.value) }))}
                  style={{ width: 60 }}
                />
              </label>
            ) : null}

            <label style={{ display: "block", margin: "8px 0" }}>
              Orientation
              <select
                data-testid="export-orientation"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as "portrait" | "landscape")}
                style={{ marginLeft: 8 }}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
          </>
        ) : null}

        <fieldset style={{ margin: "8px 0", border: "1px solid #333", padding: 6 }}>
          <legend>Layers</legend>
          <ul
            data-testid="export-layers"
            style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 160, overflowY: "auto" }}
          >
            {layers.map((l) => (
              <li key={l.id}>
                <label>
                  <input
                    type="checkbox"
                    data-testid={`export-layer-${l.name}`}
                    checked={selectedLayerIds.has(l.id)}
                    onChange={() => toggleLayer(l.id)}
                  />
                  {l.name}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={onClose}>Cancel</button>
          <button data-testid="export-confirm" onClick={() => void onExport()}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
