// Keybindings settings panel (T068).
//
// One row per command. Clicking the binding cell starts capture: the
// next keydown is recorded as the new binding for that command. Esc
// cancels capture; Backspace clears it.
import { useState } from "react";
import { builtinRegistry } from "@modcad/core";
import { useKeybindings } from "../state/keybindingStore.js";

export function KeybindingsSettings(): JSX.Element {
  const bindings = useKeybindings((s) => s.bindings);
  const setBinding = useKeybindings((s) => s.setBinding);
  const clearBinding = useKeybindings((s) => s.clearBinding);
  const [capturing, setCapturing] = useState<string | null>(null);

  const bindingForCommand = (name: string): string => {
    for (const [key, cmd] of bindings) {
      if (cmd === name) return key;
    }
    return "";
  };

  const onCaptureKey = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (capturing === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setCapturing(null);
      return;
    }
    if (e.key === "Backspace") {
      const existing = bindingForCommand(capturing);
      if (existing !== "") clearBinding(existing);
      setCapturing(null);
      return;
    }
    if (e.key.length !== 1) return;
    const upper = e.key.toUpperCase();
    // Remove previous binding for this command, if any.
    const existing = bindingForCommand(capturing);
    if (existing !== "" && existing !== upper) clearBinding(existing);
    setBinding(upper, capturing);
    setCapturing(null);
  };

  return (
    <div data-testid="keybindings-settings" style={{ padding: 12, fontFamily: "monospace" }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Keybindings</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Command</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Binding</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Description</th>
          </tr>
        </thead>
        <tbody>
          {builtinRegistry.all().map((def) => {
            const current = bindingForCommand(def.name);
            const isCapturing = capturing === def.name;
            return (
              <tr key={def.name}>
                <td style={{ padding: "4px 8px" }}>{def.name}</td>
                <td style={{ padding: "4px 8px" }}>
                  <button
                    type="button"
                    data-testid={`binding-${def.name}`}
                    onClick={() => setCapturing(def.name)}
                    onKeyDown={onCaptureKey}
                    style={{
                      minWidth: 60,
                      padding: "2px 6px",
                      background: isCapturing ? "rgba(80,140,255,0.2)" : "transparent",
                      color: "inherit",
                      border: "1px solid var(--modcad-border, #333)",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontFamily: "monospace",
                    }}
                  >
                    {isCapturing ? "Press a key…" : current || "(none)"}
                  </button>
                </td>
                <td style={{ padding: "4px 8px", opacity: 0.7 }}>{def.summary}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
