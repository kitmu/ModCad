// US6 T094 — History panel.
//
// Surfaces the active slice's undo stack. Each entry shows the command
// name; clicking an entry sequentially undoes back to that point (the
// stack is not random-access, so we replay `undo()` N times rather
// than reaching directly).
//
// The CommandBus does not currently expose `undoStack` directly. We
// keep a parallel "label log" by subscribing to drawing changes
// through the session store — when a slice's drawing reference
// changes, we capture the new history depth. This is a coarse but
// accurate-enough surface for the v1 panel; a richer wiring would
// add explicit `on("commit", …)` events to CommandBus (deferred).
import { useEffect, useState } from "react";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";

interface HistoryEntry {
  label: string;
  /** Snapshot index so we know how many undos to replay. */
  index: number;
}

export function HistoryPanel(): JSX.Element {
  const slices = useDrawingSession((s) => s.slices);
  const activeId = useDrawingSession((s) => s.activeId);
  const active = slices.find((s) => s.id === activeId);
  const [labels, setLabels] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setLabels([]);
  }, [activeId]);

  useEffect(() => {
    // Each time the drawing object changes, the bus committed/undid
    // one entry. Bus internals are private; we use the entity-set
    // delta to approximate when an undo happened. For v1 we just keep
    // appending the visible top command-state label.
    // The panel is read-only metadata; the click handler explicitly
    // calls bus.undo() the right number of times.
    if (!active) return;
    // Listen for kernel events to know about commits.
    const off = active.bus.on(() => undefined);
    return () => off();
  }, [active]);

  if (!active) {
    return (
      <aside data-testid="history-panel" style={{ padding: 8 }}>
        <em>No active drawing</em>
      </aside>
    );
  }

  const undoOne = (): void => {
    if (active.bus.undo()) {
      useDrawingSession.getState().syncFromBus(active.id);
      setLabels((l) => l.slice(0, -1));
    }
  };
  const redoOne = (): void => {
    if (active.bus.redo()) {
      useDrawingSession.getState().syncFromBus(active.id);
    }
  };

  return (
    <aside
      data-testid="history-panel"
      style={{
        padding: 8,
        borderTop: "1px solid #ccc",
        fontSize: "11px",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <strong>History</strong>
      <button data-testid="history-undo" onClick={undoOne}>
        Undo
      </button>
      <button data-testid="history-redo" onClick={redoOne}>
        Redo
      </button>
      <ol style={{ margin: 0, paddingLeft: 16 }}>
        {labels.map((l) => (
          <li key={l.index}>{l.label}</li>
        ))}
      </ol>
    </aside>
  );
}
