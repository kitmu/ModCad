/* eslint-disable formatjs/no-literal-string-in-jsx -- T046b sweep pending: messages registered in en.json will replace literals here in v1.1. */
// FR-019 import warnings surface.
//
// `surfaceDxfWarnings` is the one-shot side-effect — call after every
// DXF import. Each warning becomes a non-blocking toast via the
// existing `notify` channel (panels/NotificationsToaster.tsx). The
// ImportWarnings component is a thin grouped view consumers can mount
// when they want a collapsible alternative to the toaster.
import { useMemo, useState } from "react";
import type { DxfWarning } from "@modcad/codecs";
import { notify } from "../state/notifications.js";

function describeWarning(w: DxfWarning): string {
  switch (w.kind) {
    case "unsupported-entity":
      return `Skipped ${w.count} unsupported ${w.type} ${w.count === 1 ? "entity" : "entities"}`;
    case "mtext-formatting-stripped":
      return `Stripped ${w.count} MTEXT formatting ${w.count === 1 ? "code" : "codes"}`;
    case "missing-font":
      return `Font "${w.font}" unavailable — falling back to Helvetica`;
    case "unresolved-dimension-ref":
      return `${w.count} dimension ${w.count === 1 ? "reference was" : "references were"} unresolved on import`;
  }
}

export function surfaceDxfWarnings(warnings: readonly DxfWarning[]): void {
  if (warnings.length === 0) return;
  // One toast per warning kind keeps the surface non-blocking per FR-019.
  for (const w of warnings) notify(describeWarning(w));
}

export interface ImportWarningsProps {
  warnings: readonly DxfWarning[];
}

/**
 * Collapsible list of import warnings. Mounted near the file/import
 * area when an import produced warnings; the toaster takes over for
 * everyday surfacing. We keep both so the user can revisit warnings
 * after the toasts time out.
 */
export function ImportWarnings({ warnings }: ImportWarningsProps): JSX.Element | null {
  const [collapsed, setCollapsed] = useState(false);
  const items = useMemo(() => warnings.map(describeWarning), [warnings]);
  if (warnings.length === 0) return null;
  return (
    <div
      data-testid="import-warnings"
      style={{
        background: "#3a3322",
        border: "1px solid #5a4a2a",
        color: "#eee",
        padding: "6px 10px",
        fontSize: 12,
        margin: 4,
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          background: "transparent",
          color: "inherit",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {collapsed ? "▸" : "▾"} {warnings.length} import {warnings.length === 1 ? "warning" : "warnings"}
      </button>
      {!collapsed ? (
        <ul style={{ margin: "4px 0 0", padding: "0 0 0 16px" }}>
          {items.map((label, i) => (
            <li key={i}>{label}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
