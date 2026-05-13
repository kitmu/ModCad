/* eslint-disable formatjs/no-literal-string-in-jsx -- T046b sweep pending: messages registered in en.json will replace literals here in v1.1. */
// T109 — restore-on-open UI surfacing all available autosave snapshots.
//
// FR-031 requires that the user can pick *any* of the last 10
// snapshots per file — not only the most recent. We enumerate every
// known handleKey from autosave storage, then for each render a
// chronological list (newest first). Clicking a row decodes the
// snapshot bytes via the service and replaces the active slice.
import { useEffect, useState } from "react";
import { readModcad } from "@modcad/codecs";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import {
  listAllAutosaveLockKeys,
  listAutosavesFor,
  readAutosaveBytes,
  type AutosaveEntry,
} from "./autosave.js";

interface HandleGroup {
  handleKey: string;
  entries: AutosaveEntry[];
}

export interface RestoreDialogProps {
  open: boolean;
  onClose: () => void;
}

export function RestoreDialog({ open, onClose }: RestoreDialogProps): JSX.Element | null {
  const [groups, setGroups] = useState<HandleGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const openNew = useDrawingSession((s) => s.openNew);
  const replaceDrawing = useDrawingSession((s) => s.replaceDrawing);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const keys = await listAllAutosaveLockKeys();
      const out: HandleGroup[] = [];
      for (const k of keys) {
        const entries = await listAutosavesFor(k);
        if (entries.length) out.push({ handleKey: k, entries });
      }
      if (!cancelled) {
        setGroups(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const restore = async (entry: AutosaveEntry) => {
    const bytes = await readAutosaveBytes(entry);
    if (!bytes) return;
    const { drawing } = readModcad(bytes);
    const id = openNew(entry.lockKey);
    replaceDrawing(id, drawing, entry.lockKey);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Restore from autosave"
      data-testid="restore-dialog"
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
          border: "1px solid var(--modcad-border, #333)",
          padding: 16,
          minWidth: 360,
          maxHeight: "80vh",
          overflowY: "auto",
          color: "inherit",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <strong>Restore from autosave</strong>
          <button
            data-testid="restore-dialog-close"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "inherit" }}
          >
            ×
          </button>
        </header>
        {loading ? (
          <p>Loading…</p>
        ) : groups.length === 0 ? (
          <p data-testid="restore-dialog-empty">No autosaves available.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {groups.map((g) => (
              <li key={g.handleKey} style={{ marginBottom: 12 }}>
                <div style={{ opacity: 0.7, marginBottom: 4 }}>{g.handleKey}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {g.entries.map((e) => (
                    <li key={e.iso}>
                      <button
                        data-testid={`restore-${g.handleKey}-${e.iso}`}
                        onClick={() => void restore(e)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--modcad-border, #333)",
                          color: "inherit",
                          padding: "4px 8px",
                          marginBottom: 4,
                          width: "100%",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        {e.iso}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
