// T111 — "Take over editing" UI surfaced when another browser tab
// requests the writer lock for a file this tab currently holds.
//
// Wiring:
//   - When a writer-lock holder is acquired (e.g. on file open), the
//     owning code subscribes to `takeover.onTakeoverRequest`. That
//     subscription pushes pending requests into this dialog's store
//     and resolves with the user's choice when they click a button.
//   - "Flush + transfer" calls `saveActiveDrawing` (manual save) then
//     answers "flush". "Keep editing here" answers "discard" but
//     leaves the lock held — the requester will see the discard
//     response and treat it as rejection (see locks.ts comments).
import { create } from "zustand";
import { saveActiveDrawing } from "./fileActions.js";

interface PendingTakeover {
  fileKey: string;
  resolve: (choice: "flush" | "discard") => void;
}

interface TakeoverDialogState {
  pending: PendingTakeover | null;
  setPending: (p: PendingTakeover | null) => void;
}

export const useTakeoverDialog = create<TakeoverDialogState>((set) => ({
  pending: null,
  setPending: (p) => set({ pending: p }),
}));

/**
 * Bridge for `takeover.onTakeoverRequest`. Pushes the request into the
 * dialog and returns a promise that resolves on user choice.
 */
export function promptTakeover(fileKey: string): Promise<"flush" | "discard"> {
  return new Promise((resolve) => {
    useTakeoverDialog.getState().setPending({ fileKey, resolve });
  });
}

export function TakeoverDialog(): JSX.Element | null {
  const pending = useTakeoverDialog((s) => s.pending);
  const setPending = useTakeoverDialog((s) => s.setPending);
  if (!pending) return null;

  const onFlush = async () => {
    await saveActiveDrawing();
    pending.resolve("flush");
    setPending(null);
  };
  const onKeep = () => {
    pending.resolve("discard");
    setPending(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Another window wants to edit"
      data-testid="takeover-dialog"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        style={{
          background: "var(--modcad-bg, #1c1c1c)",
          border: "1px solid var(--modcad-border, #333)",
          padding: 16,
          minWidth: 360,
          color: "inherit",
        }}
      >
        <p>
          Another browser window wants to edit <code>{pending.fileKey}</code>.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button data-testid="takeover-keep" onClick={onKeep}>
            Keep editing here
          </button>
          <button data-testid="takeover-flush" onClick={() => void onFlush()}>
            Flush + transfer
          </button>
        </div>
      </div>
    </div>
  );
}
