// File menu (FR-016). Minimal v1: a button row with New / Open / Save /
// Save As / Recent. The Recent submenu reads from IndexedDB once T108
// (autosave restore) lands its handle cache; for US1 it stays empty.
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  newDrawing,
  openDrawingFromDisk,
  saveActiveDrawing,
  importDxfFromDisk,
} from "./fileActions.js";
import { ExportDialog } from "./ExportDialog.js";

interface MenuEntry {
  /** Stable id used both as the React key and the data-testid suffix. */
  testid: string;
  /** Message id in en.json. */
  messageId: string;
  /** English copy mirrored as defaultMessage for the formatjs extractor. */
  defaultMessage: string;
  onSelect: () => void;
}

export function FileMenu(): JSX.Element {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const entries: MenuEntry[] = [
    {
      testid: "new",
      messageId: "file.menu.new",
      defaultMessage: "New",
      onSelect: () => {
        setOpen(false);
        newDrawing();
      },
    },
    {
      testid: "open",
      messageId: "file.menu.open",
      defaultMessage: "Open…",
      onSelect: () => {
        setOpen(false);
        void openDrawingFromDisk();
      },
    },
    {
      testid: "importdxf",
      messageId: "file.menu.importDxf",
      defaultMessage: "Import DXF…",
      onSelect: () => {
        setOpen(false);
        void importDxfFromDisk();
      },
    },
    {
      testid: "save",
      messageId: "file.menu.save",
      defaultMessage: "Save",
      onSelect: () => {
        setOpen(false);
        void saveActiveDrawing();
      },
    },
    {
      testid: "saveas",
      messageId: "file.menu.saveAs",
      defaultMessage: "Save As…",
      onSelect: () => {
        setOpen(false);
        void saveActiveDrawing();
      },
    },
    {
      testid: "export",
      messageId: "file.menu.export",
      defaultMessage: "Export…",
      onSelect: () => {
        setOpen(false);
        setExportOpen(true);
      },
    },
  ];

  return (
    <div
      data-testid="file-menu"
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        data-testid="file-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={intl.formatMessage({ id: "file.menu.button.aria" })}
        onClick={() => setOpen((v) => !v)}
      >
        <FormattedMessage id="file.menu.title" defaultMessage="File" />
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
          {entries.map((e) => (
            <MenuItem
              key={e.testid}
              testid={e.testid}
              messageId={e.messageId}
              defaultMessage={e.defaultMessage}
              onClick={e.onSelect}
            />
          ))}
          <li
            role="menuitem"
            data-testid="file-menu-recent"
            style={{ padding: "4px 8px", opacity: 0.5 }}
          >
            <FormattedMessage id="file.menu.recentEmpty" defaultMessage="Recent (empty)" />
          </li>
        </ul>
      ) : null}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

function MenuItem({
  testid,
  messageId,
  defaultMessage,
  onClick,
}: {
  testid: string;
  messageId: string;
  defaultMessage: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <li role="none">
      <button
        role="menuitem"
        data-testid={`file-menu-${testid}`}
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
        <FormattedMessage id={messageId} defaultMessage={defaultMessage} />
      </button>
    </li>
  );
}
