// T121 — Three-way theme toggle for the Settings panel (FR-026).
import { FormattedMessage, useIntl } from "react-intl";
import { useThemeState, type ThemePreference } from "../state/themeState.js";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; messageId: string }> = [
  { value: "light", messageId: "settings.theme.light" },
  { value: "dark", messageId: "settings.theme.dark" },
  { value: "system", messageId: "settings.theme.system" },
];

export function ThemeToggle(): JSX.Element {
  const intl = useIntl();
  const preference = useThemeState((s) => s.preference);
  const setPreference = useThemeState((s) => s.setPreference);
  return (
    <fieldset
      data-testid="theme-toggle"
      className="flex flex-col gap-1 border border-zinc-300 p-2 text-xs dark:border-zinc-700"
    >
      <legend className="px-1">
        <FormattedMessage id="settings.theme.title" defaultMessage="Theme" />
      </legend>
      <div
        role="radiogroup"
        aria-label={intl.formatMessage({ id: "settings.theme.title" })}
        className="flex gap-2"
      >
        {OPTIONS.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-1">
            <input
              type="radio"
              name="modcad-theme"
              value={opt.value}
              checked={preference === opt.value}
              data-testid={`theme-${opt.value}`}
              onChange={() => setPreference(opt.value)}
            />
            <FormattedMessage id={opt.messageId} defaultMessage={opt.value} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
