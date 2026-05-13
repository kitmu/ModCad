// Polite ARIA live region (T069). The palette pushes announcement
// strings here when it opens, when the result count changes, and
// when a command activates — making the keyboard-only flow
// accessible to screen readers.
//
// A single visible-to-AT-but-visually-hidden div is enough; we
// rotate the content through a Zustand slice so any component
// can announce.
import { useEffect } from "react";
import { create } from "zustand";

interface AriaLiveState {
  message: string;
  announce: (msg: string) => void;
}

export const useAriaLive = create<AriaLiveState>((set) => ({
  message: "",
  // Set, then clear after a tick so the same message can be repeated.
  announce: (message) => {
    set({ message: "" });
    // Schedule the actual announcement on the next tick.
    setTimeout(() => set({ message }), 16);
  },
}));

export function AriaLive(): JSX.Element {
  const message = useAriaLive((s) => s.message);
  // Always render the live region; only the inner text changes so
  // assistive tech reliably picks up subsequent updates.
  useEffect(() => {
    // No-op — kept so React batches a render whenever message changes.
  }, [message]);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="aria-live"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {message}
    </div>
  );
}
