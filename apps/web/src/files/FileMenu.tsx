// File menu (FR-016). Minimal v1: a button row with New / Open / Save /
// Save As / Recent. The Recent submenu reads from IndexedDB once T108
// (autosave restore) lands its handle cache; for US1 it stays empty.
import { useState } from "react";
import { newDrawing, openDrawingFromDisk, saveActiveDrawing } from "./fileActions.js";

export function FileMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-testid="file-menu"
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        data-testid="file-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        File
      </button>
      {open ? (
        <ul
          role="menu"
          data-testid="file-menu-list"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "var(--modcad-bg, #1c1c1c)",
            border: "1px solid var(--modcad-border, #333)",
            zIndex: 10,
          }}
        >
          <MenuItem
            label="New"
            onClick={() => {
              setOpen(false);
              newDrawing();
            }}
          />
          <MenuItem
            label="Open…"
            onClick={() => {
              setOpen(false);
              void openDrawingFromDisk();
            }}
          />
          <MenuItem
            label="Save"
            onClick={() => {
              setOpen(false);
              void saveActiveDrawing();
            }}
          />
          <MenuItem
            label="Save As…"
            onClick={() => {
              setOpen(false);
              void saveActiveDrawing();
            }}
          />
          <li
            role="menuitem"
            data-testid="file-menu-recent"
            style={{ padding: "4px 8px", opacity: 0.5 }}
          >
            Recent (empty)
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <li role="none">
      <button
        role="menuitem"
        data-testid={`file-menu-${label.replace(/[\s…]/g, "").toLowerCase()}`}
        onClick={onClick}
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          padding: "4px 8px",
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    </li>
  );
}
