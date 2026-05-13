// Modal command palette (Ctrl/Cmd-K) — T066 + T069.
//
// WAI-ARIA combobox pattern: a textbox owns aria-activedescendant
// pointing at the focused listbox option, and the listbox renders
// all ranked candidates. Arrow keys move the active descendant;
// Enter activates it; Escape closes the palette.
//
// Live announcements (T069) push palette-open, result-count, and
// activation strings through useAriaLive so screen readers track
// the keyboard-only flow.
import { useEffect, useMemo, useRef } from "react";
import { usePaletteState } from "../state/paletteState.js";
import { useKeybindings } from "../state/keybindingStore.js";
import { useAriaLive } from "../canvas/AriaLive.js";
import {
  applyActivation,
  rankedFor,
  resolveInput,
} from "./dispatch.js";
import type { Ranked } from "@modcad/ui-kit";

const LIST_ID = "modcad-palette-list";

export function CommandPalette(): JSX.Element | null {
  const open = usePaletteState((s) => s.open);
  const query = usePaletteState((s) => s.query);
  const selectedIndex = usePaletteState((s) => s.selectedIndex);
  const error = usePaletteState((s) => s.error);
  const setQuery = usePaletteState((s) => s.setQuery);
  const setSelectedIndex = usePaletteState((s) => s.setSelectedIndex);
  const setOpen = usePaletteState((s) => s.setOpen);
  const setError = usePaletteState((s) => s.setError);
  const bindings = useKeybindings((s) => s.bindings);
  const announce = useAriaLive((s) => s.announce);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Build effective bindings: command name → key (reverse lookup).
  const bindingForCommand = useMemo(() => {
    const m = new Map<string, string>();
    for (const [key, cmd] of bindings) m.set(cmd, key);
    return m;
  }, [bindings]);

  // Ranked results (query-aware).
  const results: Ranked[] = useMemo(() => {
    if (!open) return [];
    return rankedFor(query);
  }, [open, query]);

  // Auto-focus the input + announce on open.
  useEffect(() => {
    if (!open) return;
    // Focus on next tick so the element is mounted.
    queueMicrotask(() => inputRef.current?.focus());
    announce("Command palette open");
  }, [open, announce]);

  // Announce result count whenever it changes while open.
  useEffect(() => {
    if (!open) return;
    announce(`${results.length} result${results.length === 1 ? "" : "s"}`);
  }, [open, results.length, announce]);

  if (!open) return null;

  const clamp = (i: number): number => {
    if (results.length === 0) return 0;
    if (i < 0) return results.length - 1;
    if (i >= results.length) return 0;
    return i;
  };

  const activate = (index: number): void => {
    // For typed coordinates: bypass the list and resolve from query.
    const coordLikelihood = /^[@+\-0-9.]/.test(query.trim());
    if (coordLikelihood) {
      const result = resolveInput(query);
      if (result.kind === "error") {
        setError(result.error);
        announce(`Error: ${result.error}`);
        return;
      }
      const ok = applyActivation(result);
      if (!ok && result.kind === "coordinate") {
        setError("no active command to receive coordinates");
        announce("No active command to receive coordinates");
        return;
      }
      announce(
        result.kind === "coordinate"
          ? `Coordinate ${result.point[0]}, ${result.point[1]}`
          : `Activated ${(result as { kind: "command"; name: string }).name}`,
      );
      setOpen(false);
      return;
    }
    const hit = results[index];
    if (!hit) {
      setError(`no command matches "${query}"`);
      return;
    }
    const fired = applyActivation({ kind: "command", name: hit.name });
    if (!fired) {
      setError(`command not bound: ${hit.name}`);
      announce(`Command not bound: ${hit.name}`);
      return;
    }
    announce(`Activated ${hit.name}`);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(clamp(selectedIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(clamp(selectedIndex - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(selectedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div
      data-testid="palette-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        style={{
          width: "min(640px, 92vw)",
          background: "var(--modcad-bg, #1e1e1e)",
          border: "1px solid var(--modcad-border, #444)",
          borderRadius: 8,
          color: "var(--modcad-fg, #eee)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
      >
        <div role="combobox" aria-expanded="true" aria-haspopup="listbox" aria-owns={LIST_ID}>
          <input
            ref={inputRef}
            data-testid="palette-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-controls={LIST_ID}
            aria-activedescendant={
              results[selectedIndex] ? `palette-row-${results[selectedIndex]!.name}` : undefined
            }
            aria-label="Command palette"
            placeholder="Type a command or coordinate (x,y, @dx,dy, @d<a)…"
            spellCheck={false}
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: 16,
              background: "transparent",
              color: "inherit",
              border: "none",
              outline: "none",
              borderBottom: "1px solid var(--modcad-border, #444)",
              fontFamily: "monospace",
            }}
          />
        </div>
        {error !== null ? (
          <div
            data-testid="palette-error"
            role="alert"
            style={{ padding: "6px 14px", color: "#f88", fontSize: 12 }}
          >
            {error}
          </div>
        ) : null}
        <ul
          id={LIST_ID}
          role="listbox"
          data-testid="palette-list"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {results.map((r, i) => (
            <li
              key={r.name}
              id={`palette-row-${r.name}`}
              role="option"
              aria-selected={i === selectedIndex}
              data-testid="palette-row"
              data-command={r.name}
              onClick={() => activate(i)}
              style={{
                padding: "6px 14px",
                background: i === selectedIndex ? "rgba(80,140,255,0.18)" : "transparent",
                display: "flex",
                gap: 12,
                alignItems: "baseline",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: 13,
              }}
            >
              <span data-testid="palette-row-name" style={{ flex: "0 0 auto" }}>
                {highlight(r.name, r.matchedAlias ? [] : r.matchSpans)}
              </span>
              <span style={{ flex: 1, opacity: 0.7 }}>{r.summary}</span>
              <span
                data-testid="palette-row-binding"
                style={{ opacity: 0.6, marginLeft: 8 }}
              >
                {bindingForCommand.get(r.name) ?? r.binding ?? ""}
              </span>
            </li>
          ))}
          {results.length === 0 ? (
            <li
              data-testid="palette-empty"
              style={{ padding: "12px 14px", opacity: 0.6, fontFamily: "monospace" }}
            >
              No matches
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function highlight(label: string, spans: [number, number][]): JSX.Element[] {
  if (spans.length === 0) return [<span key="0">{label}</span>];
  const out: JSX.Element[] = [];
  let cursor = 0;
  let k = 0;
  for (const [s, e] of spans) {
    if (cursor < s) {
      out.push(<span key={`p${k++}`}>{label.slice(cursor, s)}</span>);
    }
    out.push(
      <mark key={`m${k++}`} style={{ background: "transparent", color: "#7cf", fontWeight: 600 }}>
        {label.slice(s, e)}
      </mark>,
    );
    cursor = e;
  }
  if (cursor < label.length) {
    out.push(<span key={`p${k++}`}>{label.slice(cursor)}</span>);
  }
  return out;
}
