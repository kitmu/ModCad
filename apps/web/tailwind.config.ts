import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // T121: chrome theme follows the explicit `data-theme` attribute that
  // ThemeRoot writes onto <html>. We also enable `class` mode so the
  // toggle activates the standard `dark:` variant via classList.
  darkMode: ["class", "[data-theme='dark']"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
