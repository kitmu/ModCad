// Non-modal toast surface — renders the active notifications stack.
//
// Used by US3 acceptance scenario 4 (locked-layer modification rejected
// with a non-modal notification) and any future FR-012-style rejection.
import { useNotifications } from "../state/notifications.js";

export function NotificationsToaster(): JSX.Element {
  const list = useNotifications((s) => s.list);
  const dismiss = useNotifications((s) => s.dismiss);
  return (
    <div
      data-testid="notifications"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      {list.map((n) => (
        <div
          key={n.id}
          data-testid="notification"
          onClick={() => dismiss(n.id)}
          style={{
            background: "#3a2222",
            border: "1px solid #5a3a3a",
            color: "#eee",
            padding: "6px 10px",
            fontSize: 12,
            pointerEvents: "auto",
            cursor: "pointer",
          }}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
}
