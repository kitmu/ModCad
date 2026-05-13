// T122 — Hook-less message lookup for code paths that can't run inside
// a React component (Zustand store actions, error builders, notify()).
// React components should prefer <FormattedMessage> or useIntl().
//
// The provider seeds `setMessages` on mount; until then, formatting
// returns the message id verbatim so accidental early access surfaces
// loudly in dev.
import en from "./en.json";

export type MessageId = keyof typeof en;

let activeMessages: Record<string, string> = en;
let activeLocale = "en";

export function setMessages(locale: string, messages: Record<string, string>): void {
  activeLocale = locale;
  activeMessages = messages;
}

export function getLocale(): string {
  return activeLocale;
}

/**
 * Format a message by id with optional ICU-style {placeholder} values.
 * Intentionally minimal — for plural/select formatting use react-intl's
 * <FormattedMessage> or useIntl().formatMessage inside components.
 */
export function t(id: MessageId, values?: Record<string, string | number>): string {
  const template = activeMessages[id] ?? (en as Record<string, string>)[id] ?? id;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const v = values[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}
