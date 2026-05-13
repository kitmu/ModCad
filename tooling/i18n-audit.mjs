// T122: i18n maintenance gate. ESLint's no-restricted-syntax rule (in
// T046) blocks raw JSX string literals at lint time; this audit checks
// that en.json is in sync with extracted messages from the source tree.
//
// Until the wrapper lands (T046), this is a no-op pass.
import { access } from "node:fs/promises";

try {
  await access(new URL("../apps/web/src/i18n/en.json", import.meta.url));
} catch {
  console.log("[i18n-audit] en.json not present yet; skipping (full check: T122)");
  process.exit(0);
}
console.log("[i18n-audit] placeholder pass (full implementation: T122)");
process.exit(0);
