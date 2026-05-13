// FR-033: in-app multi-document tab strip.
//
// v1 surface: open / close / switch / drag-reorder pending (uses native
// HTML5 DnD until a richer DnD lib justifies itself). Keyboard cycle
// bindings live in apps/web/src/canvas/PointerInput.ts so they share
// the global key-event router.
import { useDrawingSession } from "./DrawingSessionStore.js";

export function TabStrip() {
  const slices = useDrawingSession((s) => s.slices);
  const activeId = useDrawingSession((s) => s.activeId);
  const setActive = useDrawingSession((s) => s.setActive);
  const close = useDrawingSession((s) => s.close);
  const openNew = useDrawingSession((s) => s.openNew);
  const reorder = useDrawingSession((s) => s.reorder);
  const isAtSoftLimit = useDrawingSession((s) => s.isAtSoftLimit);

  return (
    <div
      role="tablist"
      aria-label="Open drawings"
      data-testid="tab-strip"
      style={{
        display: "flex",
        gap: 4,
        alignItems: "center",
        padding: 4,
        borderBottom: "1px solid var(--modcad-border, #333)",
      }}
    >
      {slices.map((s, i) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={s.id === activeId}
          data-testid={`tab-${s.id}`}
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/modcad-tab-index", String(i))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData("text/modcad-tab-index"));
            if (Number.isFinite(from) && from !== i) reorder(from, i);
          }}
          onAuxClick={(e) => {
            // FR-033: middle-click closes the slot.
            if (e.button === 1) close(s.id);
          }}
          onClick={() => setActive(s.id)}
        >
          {s.name}
          {s.dirty ? " •" : ""}
          <span
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              close(s.id);
            }}
            style={{ marginLeft: 8, cursor: "pointer" }}
          >
            ×
          </span>
        </button>
      ))}
      <button
        data-testid="tab-new"
        title={isAtSoftLimit() ? "Soft limit reached (10 open drawings)" : "New drawing"}
        onClick={() => openNew()}
      >
        +
      </button>
    </div>
  );
}
