/* eslint-disable formatjs/no-literal-string-in-jsx -- T046b sweep pending: messages registered in en.json will replace literals here in v1.1. */
// Read-only bindings reference modal (T068).
//
// Opened by pressing `?` from anywhere outside an input. Lists every
// command with its current keybinding (defaults + user overrides).
import { useEffect, useMemo, useRef } from "react";
import { builtinRegistry } from "@modcad/core";
import { usePaletteState } from "../state/paletteState.js";
import { useKeybindings } from "../state/keybindingStore.js";

export function BindingsReference(): JSX.Element | null {
  const open = usePaletteState((s) => s.bindingsOpen);
  const setOpen = usePaletteState((s) => s.setBindingsOpen);
  const bindings = useKeybindings((s) => s.bindings);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const rows = useMemo(() => {
    const bindingForCommand = new Map<string, string>();
    for (const [key, cmd] of bindings) bindingForCommand.set(cmd, key);
    return builtinRegistry
      .all()
      .map((def) => ({
        name: def.name,
        summary: def.summary,
        binding: bindingForCommand.get(def.name) ?? def.defaultBinding ?? "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bindings]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-testid="bindings-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard bindings"
        style={{
          width: "min(560px, 92vw)",
          maxHeight: "80vh",
          background: "var(--modcad-bg, #1e1e1e)",
          color: "var(--modcad-fg, #eee)",
          border: "1px solid var(--modcad-border, #444)",
          borderRadius: 8,
          padding: 16,
          overflowY: "auto",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <strong>Keyboard bindings</strong>
          <button
            ref={closeRef}
            data-testid="bindings-close"
            onClick={() => setOpen(false)}
            style={{ background: "transparent", color: "inherit", border: "none", cursor: "pointer" }}
          >
            Close
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px", opacity: 0.6 }}>Key</th>
              <th style={{ textAlign: "left", padding: "4px 8px", opacity: 0.6 }}>Command</th>
              <th style={{ textAlign: "left", padding: "4px 8px", opacity: 0.6 }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{row.binding}</td>
                <td style={{ padding: "4px 8px" }}>{row.name}</td>
                <td style={{ padding: "4px 8px", opacity: 0.75 }}>{row.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
