// T127a — SC-008 enforcement.
//
// Every command registered in @modcad/core's `builtinRegistry` must be
// referenced by at least one Playwright e2e spec. References can be:
//   - the canonical name      ("draw.line")
//   - any registered alias    ("L", "LINE", …)
//   - the default binding key as a keyboard input ('L')
//
// Test files in `apps/web/tests/*.spec.ts` are the source of truth. We
// don't try to parse JS — a simple substring scan is sufficient and
// matches the way commands are dispatched in tests (Ctrl+K → type
// alias, or page.keyboard.press("l")).
//
// Failure mode: list the orphans and exit non-zero so CI blocks the
// merge until either a test covers the command or the command is
// removed from the registry.
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REGISTRY_PATH = join(ROOT, "packages/core/src/commands/registry.ts");
const TESTS_DIR = join(ROOT, "apps/web/tests");

// Parse the registry file directly (avoids spinning up a TS toolchain).
// The shape is stable: `defs` is a const array of object literals
// containing `name`, `aliases`, and optional `defaultBinding`.
function parseRegistry(text) {
  const out = [];
  // Match contiguous `{ ... }` blocks inside the defs array. The block
  // must contain a `name:` entry to count as a definition.
  const blockRe = /\{\s*\n\s*name:\s*"([^"]+)",[\s\S]*?\}/g;
  let m;
  while ((m = blockRe.exec(text))) {
    const block = m[0];
    const name = m[1];
    const aliasMatch = block.match(/aliases:\s*\[([^\]]*)\]/);
    const aliases = aliasMatch
      ? [...aliasMatch[1].matchAll(/"([^"]+)"/g)].map((a) => a[1])
      : [];
    const bindMatch = block.match(/defaultBinding:\s*"([^"]+)"/);
    const defaultBinding = bindMatch ? bindMatch[1] : undefined;
    out.push({ name, aliases, defaultBinding });
  }
  return out;
}

const registryText = await readFile(REGISTRY_PATH, "utf8");
const defs = parseRegistry(registryText);
if (defs.length === 0) {
  console.error(`[check-command-coverage] FAIL: parsed 0 commands from ${REGISTRY_PATH}`);
  process.exit(1);
}

const testFiles = (await readdir(TESTS_DIR)).filter((f) => f.endsWith(".spec.ts"));
const corpus = (
  await Promise.all(testFiles.map((f) => readFile(join(TESTS_DIR, f), "utf8")))
).join("\n");

function isReferenced(def) {
  if (corpus.includes(`"${def.name}"`)) return true;
  if (corpus.includes(`'${def.name}'`)) return true;
  for (const a of def.aliases) {
    // Aliases are short (L, REC, PL, …). Require quoted boundaries to
    // avoid false matches against natural-language test prose.
    if (
      corpus.includes(`"${a}"`) ||
      corpus.includes(`'${a}'`) ||
      corpus.includes(`"${a.toLowerCase()}"`) ||
      corpus.includes(`'${a.toLowerCase()}'`)
    ) {
      return true;
    }
  }
  if (def.defaultBinding) {
    const k = def.defaultBinding;
    if (
      corpus.includes(`press("${k}")`) ||
      corpus.includes(`press('${k}')`) ||
      corpus.includes(`press("${k.toLowerCase()}")`) ||
      corpus.includes(`press('${k.toLowerCase()}')`) ||
      corpus.includes(`type("${k}")`) ||
      corpus.includes(`type('${k}')`)
    ) {
      return true;
    }
  }
  return false;
}

const orphans = defs.filter((d) => !isReferenced(d));
if (orphans.length === 0) {
  console.log(
    `[check-command-coverage] OK — ${defs.length} commands, all referenced by at least one e2e spec.`,
  );
  process.exit(0);
}
console.error(
  `[check-command-coverage] FAIL: ${orphans.length} command(s) without any e2e reference:`,
);
for (const d of orphans) {
  console.error(
    `   - ${d.name}  aliases=[${d.aliases.join(", ")}]  binding=${d.defaultBinding ?? "(none)"}`,
  );
}
process.exit(1);
