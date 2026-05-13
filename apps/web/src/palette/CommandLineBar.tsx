// Always-visible bottom command-line bar (T066).
//
// The legacy AutoCAD-style command prompt. Shares input model with
// the modal palette via `paletteState`, but renders inline at the
// bottom of the workspace with no list overlay — Enter commits.
import { useEffect, useRef } from "react";
import { usePaletteState } from "../state/paletteState.js";
import { useCommandState } from "../state/commandState.js";
import { useAriaLive } from "../canvas/AriaLive.js";
import { applyActivation, resolveInput } from "./dispatch.js";

export function CommandLineBar(): JSX.Element {
  const error = usePaletteState((s) => s.error);
  const setError = usePaletteState((s) => s.setError);
  const active = useCommandState((s) => s.active);
  const announce = useAriaLive((s) => s.announce);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Local input so the bar doesn't fight with the modal palette over
  // shared `query`. The bar is its own surface; the modal owns the
  // palette `open` state.
  const localRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (localRef.current && document.activeElement === document.body) {
      // Don't steal focus — only ensure it's reachable.
    }
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      const text = e.currentTarget.value;
      const result = resolveInput(text);
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
      if (!ok && result.kind === "command") {
        setError(`command not bound: ${result.name}`);
        announce(`Command not bound: ${result.name}`);
        return;
      }
      setError(null);
      announce(
        result.kind === "coordinate"
          ? `Coordinate ${result.point[0]}, ${result.point[1]}`
          : `Activated ${result.name}`,
      );
      e.currentTarget.value = "";
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.value = "";
      setError(null);
      e.currentTarget.blur();
    }
  };

  return (
    <div
      data-testid="command-line-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        borderTop: "1px solid var(--modcad-border, #333)",
        fontFamily: "monospace",
        fontSize: 12,
        background: "var(--modcad-bg-secondary, #181818)",
      }}
    >
      <span style={{ opacity: 0.6 }}>{active?.label ?? "Command"}:</span>
      <input
        ref={(el) => {
          inputRef.current = el;
          localRef.current = el;
        }}
        data-testid="command-line-input"
        type="text"
        aria-label="Command line"
        placeholder={active ? active.step.prompt : "Type a command or coordinate"}
        spellCheck={false}
        onKeyDown={onKeyDown}
        style={{
          flex: 1,
          padding: "2px 6px",
          background: "transparent",
          color: "inherit",
          border: "1px solid var(--modcad-border, #333)",
          borderRadius: 3,
          outline: "none",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      />
      {error !== null ? (
        <span data-testid="command-line-error" role="alert" style={{ color: "#f88" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
