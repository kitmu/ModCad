// T122 — App-level i18n provider. Mounts react-intl with the active
// locale's message bundle. v1 ships English only; the `xx` pseudolocale
// exists so we can dogfood non-English rendering in dev without a full
// translation set.
//
// Locale selection precedence:
//   1. `?locale=` query string (dev/test override)
//   2. `localStorage["modcad.locale"]` (user pin, future settings UI)
//   3. `navigator.languages` first entry whose root matches a bundle
//   4. English fallback
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IntlProvider as ReactIntlProvider } from "react-intl";
import en from "./en.json";
import xx from "./xx.json";
import { setMessages } from "./messages.js";

export type LocaleId = "en" | "xx";

const BUNDLES: Record<LocaleId, Record<string, string>> = {
  en,
  xx: { ...en, ...xx },
};

export function detectLocale(): LocaleId {
  if (typeof window === "undefined") return "en";
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("locale");
    if (q && isLocale(q)) return q;
    const pinned = window.localStorage.getItem("modcad.locale");
    if (pinned && isLocale(pinned)) return pinned;
    const langs = window.navigator.languages ?? [window.navigator.language];
    for (const l of langs) {
      const root = l.split("-")[0] ?? "";
      if (isLocale(root)) return root;
    }
  } catch {
    // localStorage / navigator may be unavailable in headless envs;
    // fall through to English.
  }
  return "en";
}

function isLocale(s: string): s is LocaleId {
  return s === "en" || s === "xx";
}

export interface IntlProviderProps {
  children: ReactNode;
  /** Override for tests; otherwise auto-detected. */
  locale?: LocaleId;
}

export function IntlProvider({ children, locale }: IntlProviderProps): JSX.Element {
  const [active, setActive] = useState<LocaleId>(locale ?? "en");

  useEffect(() => {
    if (locale) {
      setActive(locale);
      return;
    }
    setActive(detectLocale());
  }, [locale]);

  const messages = useMemo(() => BUNDLES[active], [active]);

  // Seed the hook-less `t()` helper so non-React code can format
  // (status text in stores, error notifications, …).
  useEffect(() => {
    setMessages(active, messages);
  }, [active, messages]);

  return (
    <ReactIntlProvider
      locale={active}
      defaultLocale="en"
      messages={messages}
      onError={(err) => {
        // Missing translation in non-English bundles is expected during
        // dev — react-intl falls back to `defaultMessage` automatically.
        if (err.code === "MISSING_TRANSLATION") return;
        console.warn("[i18n]", err.message);
      }}
    >
      {children}
    </ReactIntlProvider>
  );
}
