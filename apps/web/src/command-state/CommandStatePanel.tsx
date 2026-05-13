/* eslint-disable formatjs/no-literal-string-in-jsx -- T046b sweep pending: messages registered in en.json will replace literals here in v1.1. */
// Active-command panel (T060). Reads from the commandState slice; the
// US2 command palette will be the primary writer once it lands.
//
// For US1 each Tool calls `useCommandState.setActive(...)` on entry and
// `clear()` on commit/cancel.
import { useCommandState } from "../state/commandState.js";

export function CommandStatePanel(): JSX.Element {
  const active = useCommandState((s) => s.active);
  return (
    <div
      data-testid="command-state"
      style={{
        padding: "4px 8px",
        borderTop: "1px solid var(--modcad-border, #333)",
        fontFamily: "monospace",
        fontSize: 12,
        minHeight: 22,
      }}
    >
      {active ? (
        <>
          <strong data-testid="command-state-label">{active.label}</strong>
          <span> — </span>
          <span data-testid="command-state-prompt">{active.step.prompt}</span>
          {active.step.hints.length > 0 ? (
            <span style={{ marginLeft: 12, opacity: 0.7 }}>
              [{active.step.hints.join(" | ")}]
            </span>
          ) : null}
        </>
      ) : (
        <span data-testid="command-state-idle" style={{ opacity: 0.5 }}>
          Ready — press L for line, R for rectangle, C for circle, A for arc,
          P for polyline, E for ellipse, O for point.
        </span>
      )}
    </div>
  );
}
