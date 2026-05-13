// T122 — i18n maintenance gate.
//
// What this checks:
//   1. `apps/web/src/i18n/en.json` exists and is valid JSON.
//   2. Every message id referenced in `apps/web/src/**/*.{ts,tsx}`
//      (whether via <FormattedMessage id="…">, useIntl().formatMessage,
//      or the hook-less t("…") helper) has a translation in en.json.
//   3. Every key in en.json is referenced somewhere in source — orphans
//      signal that a sweep removed JSX but forgot the bundle entry.
//
// Sibling extractor: `pnpm --filter @modcad/web i18n:extract` writes
// `apps/web/src/i18n/extracted.json` from <FormattedMessage> descriptors.
// The audit consumes that file too: every extracted id must exist in
// en.json with the same `defaultMessage`. If extracted.json is missing
// we silently run the lighter (source-grep) checks only.
import { readFile, access, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url);
const SRC = new URL("apps/web/src/", ROOT);
const EN_PATH = new URL("apps/web/src/i18n/en.json", ROOT);
const EXTRACTED_PATH = new URL("apps/web/src/i18n/extracted.json", ROOT);

async function exists(u) {
  try {
    await access(u);
    return true;
  } catch {
    return false;
  }
}

// Files we deliberately skip: storage keys, builtin command registry,
// and state stores hold dotted strings that look like message ids but
// aren't user-visible chrome.
const SKIP_PATTERNS = [
  /\/state\/themeState\.ts$/,
  /\/state\/keybindingStore\.ts$/,
  /\/settings\/unitsPrefs\.ts$/,
  /\/i18n\/(messages|extracted)\.[tj]s$/,
  /\/i18n\/IntlProvider\.tsx$/,
  /\.test\./,
];

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      out.push(...(await walk(p)));
    } else if (/\.(tsx?|jsx?)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) {
      if (SKIP_PATTERNS.some((re) => re.test(p))) continue;
      out.push(p);
    }
  }
  return out;
}

// Matches:
//   id="some.id"            (JSX attribute)
//   id: "some.id"           (descriptor object)
//   t("some.id"             (hook-less helper)
//   intl.formatMessage({ id: "some.id" }
// Each pattern captures the id of a message in a *specific* context:
//   - <FormattedMessage id="x" …/>
//   - intl.formatMessage({ id: "x", … })  (inline object property)
//   - the hook-less t("x", …) helper
//   - a small per-component fmt("x") shorthand used in Grips
// We deliberately do NOT scan arbitrary quoted strings: command-name
// strings (e.g. "draw.line") and storage keys (e.g. "modcad.theme")
// look exactly like message ids and would produce false positives.
const ID_PATTERNS = [
  /<FormattedMessage[^>]*?\bid=["']([a-zA-Z][\w.]+)["']/g,
  /\bformatMessage\s*\(\s*\{\s*id\s*:\s*["']([a-zA-Z][\w.]+)["']/g,
  /\bid\s*:\s*["']([a-z][\w.]+\.[a-zA-Z][\w]+)["']\s*,\s*defaultMessage/g,
  /\bmessageId\s*:\s*["']([a-zA-Z][\w.]+)["']/g,
  /\bt\(\s*["']([a-zA-Z][\w.]+)["']/g,
  /\bfmt\(\s*["']([a-zA-Z][\w.]+)["']/g,
  // Ternary inside any call: capture both branches.
  /\?\s*["']([a-zA-Z][\w.]+\.[a-zA-Z][\w]+)["']\s*:\s*["'][a-zA-Z][\w.]+["']/g,
  /\?\s*["'][a-zA-Z][\w.]+["']\s*:\s*["']([a-zA-Z][\w.]+\.[a-zA-Z][\w]+)["']/g,
];

function looksLikeMessageId(s, allowedPrefixes) {
  // Heuristic: dot-namespaced lowercase ids only. Filters out things
  // like `id="modcad-canvas"` or `id="palette-row-…"` (kebab). We
  // also require the prefix (before the first `.`) to be a namespace
  // we already use in en.json, so command names like "draw.line" and
  // storage keys like "modcad.theme" don't masquerade as missing ids.
  if (!/^[a-z]+(\.[a-zA-Z][\w]*)+$/.test(s)) return false;
  const prefix = s.split(".")[0];
  return allowedPrefixes.has(prefix);
}

if (!(await exists(EN_PATH))) {
  console.error("[i18n-audit] FAIL: apps/web/src/i18n/en.json missing");
  process.exit(1);
}
const en = JSON.parse(await readFile(EN_PATH, "utf8"));
const enKeys = new Set(Object.keys(en));
const allowedPrefixes = new Set([...enKeys].map((k) => k.split(".")[0]));

const files = await walk(new URL(".", SRC).pathname);
const referenced = new Set();
// Secondary pass: any FormattedMessage with `id={…}` (expression form)
// might wrap a conditional like `target.locked ? "x.lock" : "x.unlock"`.
// Find the expression block and scan every quoted dotted string in it.
const EXPR_PATTERN = /<FormattedMessage[\s\S]*?\bid=\{([\s\S]*?)\}[\s\S]*?\/>/g;
const QUOTED = /["']([a-zA-Z][\w.]+)["']/g;
for (const f of files) {
  const text = await readFile(f, "utf8");
  for (const pat of ID_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text))) {
      const id = m[1];
      if (looksLikeMessageId(id, allowedPrefixes)) referenced.add(id);
    }
  }
  EXPR_PATTERN.lastIndex = 0;
  let xm;
  while ((xm = EXPR_PATTERN.exec(text))) {
    QUOTED.lastIndex = 0;
    let qm;
    while ((qm = QUOTED.exec(xm[1]))) {
      if (looksLikeMessageId(qm[1], allowedPrefixes)) referenced.add(qm[1]);
    }
  }
}

const missing = [...referenced].filter((id) => !enKeys.has(id)).sort();
const orphan = [...enKeys].filter((id) => !referenced.has(id)).sort();

const extractedMismatch = [];
if (await exists(EXTRACTED_PATH)) {
  const ext = JSON.parse(await readFile(EXTRACTED_PATH, "utf8"));
  for (const [id, desc] of Object.entries(ext)) {
    if (!enKeys.has(id)) {
      extractedMismatch.push(`extracted ${id} not present in en.json`);
    } else if (
      desc &&
      typeof desc.defaultMessage === "string" &&
      desc.defaultMessage !== en[id]
    ) {
      extractedMismatch.push(
        `extracted ${id} defaultMessage drifted from en.json:\n   en:  ${JSON.stringify(en[id])}\n   src: ${JSON.stringify(desc.defaultMessage)}`,
      );
    }
  }
}

if (missing.length === 0 && orphan.length === 0 && extractedMismatch.length === 0) {
  console.log(
    `[i18n-audit] OK — ${enKeys.size} keys, ${referenced.size} referenced from source.`,
  );
  process.exit(0);
}
if (missing.length) {
  console.error("[i18n-audit] FAIL: referenced ids missing from en.json:");
  for (const id of missing) console.error("   - " + id);
}
if (orphan.length) {
  console.error("[i18n-audit] FAIL: orphan ids in en.json (no source reference):");
  for (const id of orphan) console.error("   - " + id);
}
if (extractedMismatch.length) {
  console.error("[i18n-audit] FAIL: extracted vs en.json drift:");
  for (const m of extractedMismatch) console.error("   - " + m);
}
process.exit(1);
