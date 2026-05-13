// T121 — Wraps the app so `<html data-theme>` and `class="dark"` track
// the user's theme preference (FR-026). The Tailwind config opts into
// `darkMode: ["class", "[data-theme='dark']"]`, so toggling the attribute
// flips every chrome `dark:` variant in lock-step.
import { useEffect, type ReactNode } from "react";
import { resolveTheme, useThemeState } from "../state/themeState.js";

export function ThemeRoot({ children }: { children: ReactNode }): JSX.Element {
  const preference = useThemeState((s) => s.preference);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (): void => {
      const resolved = resolveTheme(preference);
      root.setAttribute("data-theme", resolved);
      root.classList.toggle("dark", resolved === "dark");
    };
    apply();
    if (preference !== "system") return;
    // Re-apply when the OS preference flips and the user is on "system".
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (): void => apply();
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [preference]);

  return <>{children}</>;
}
