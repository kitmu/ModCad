// Lightweight non-modal toast bus.
//
// FR-012 (locked-layer rejection) and US3 acceptance scenario 4 require
// a non-modal notification surface. The Toast component (T046's status
// bar / toast hub) is the eventual home; until then, this is the only
// channel. Subscribers receive a fresh array on each emit.
import { create } from "zustand";

export interface Notification {
  id: number;
  message: string;
  createdAt: number;
}

interface NotificationsState {
  list: Notification[];
  push: (message: string) => void;
  dismiss: (id: number) => void;
  clear: () => void;
}

let counter = 1;
const TIMEOUT_MS = 4_000;

export const useNotifications = create<NotificationsState>((set) => ({
  list: [],
  push: (message: string) => {
    const id = counter++;
    const item: Notification = { id, message, createdAt: Date.now() };
    set((s) => ({ list: [...s.list, item] }));
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        set((s) => ({ list: s.list.filter((n) => n.id !== id) }));
      }, TIMEOUT_MS);
    }
  },
  dismiss: (id: number) => set((s) => ({ list: s.list.filter((n) => n.id !== id) })),
  clear: () => set({ list: [] }),
}));

/** Convenience function for non-React callers. */
export function notify(message: string): void {
  useNotifications.getState().push(message);
}
