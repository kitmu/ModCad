// US6 FR-025b — Contextual mini-toolbar that appears next to a hovered
// grip. Options are entity-kind-aware (polyline vertex, arc midpoint,
// dimension definition).
//
// Alt+ArrowLeft/Right cycle the focused option (keyboard reachability
// per the FR-025b "keyboard-reachable" requirement).
import { useEffect, useState } from "react";

export interface GripToolbarOption {
  id: string;
  label: string;
}

export interface GripToolbarProps {
  options: ReadonlyArray<GripToolbarOption>;
  anchor: { left: number; top: number };
}

export function GripToolbar({ options, anchor }: GripToolbarProps): JSX.Element {
  const [focusIdx, setFocusIdx] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocusIdx((i) => (i + 1) % options.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusIdx((i) => (i - 1 + options.length) % options.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options.length]);

  return (
    <div
      data-testid="grip-toolbar"
      role="toolbar"
      style={{
        position: "absolute",
        left: anchor.left + 12,
        top: anchor.top - 4,
        background: "#fff",
        border: "1px solid #888",
        padding: "2px",
        fontSize: "11px",
        whiteSpace: "nowrap",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        pointerEvents: "auto",
        display: "flex",
        gap: "2px",
      }}
    >
      {options.map((o, i) => (
        <button
          key={o.id}
          data-testid={`grip-option-${o.id}`}
          aria-current={i === focusIdx ? "true" : undefined}
          style={{
            background: i === focusIdx ? "#cef" : "transparent",
            border: "1px solid transparent",
            padding: "2px 4px",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
