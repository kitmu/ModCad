// Per-file coverage gates per Constitution Principle IV.
// Reads coverage-summary.json (produced by `pnpm test --coverage`) and
// enforces:
//   - packages/core/src/geometry/predicates.ts: lines >= 95, branches = 100
//   - packages/core/src/commands/**: lines = 100, branches = 100
import { readFile } from "node:fs/promises";

const GATES = [
  { match: /packages\/core\/src\/geometry\/predicates\.ts$/, lines: 95, branches: 100 },
  { match: /packages\/core\/src\/commands\//, lines: 100, branches: 100 },
];

const summary = JSON.parse(
  await readFile(new URL("../coverage/coverage-summary.json", import.meta.url), "utf8").catch(
    () => "{}",
  ),
);

if (!Object.keys(summary).length) {
  console.warn("[check-coverage] no coverage-summary.json found; skipping (run with --coverage)");
  process.exit(0);
}

let failed = 0;
for (const [file, metrics] of Object.entries(summary)) {
  if (file === "total" || typeof metrics !== "object" || !metrics) continue;
  for (const gate of GATES) {
    if (gate.match.test(file)) {
      const m = /** @type {any} */ (metrics);
      if (m.lines?.pct < gate.lines || m.branches?.pct < gate.branches) {
        console.error(
          `[check-coverage] ${file}: lines=${m.lines?.pct}% branches=${m.branches?.pct}% (need ${gate.lines}/${gate.branches})`,
        );
        failed++;
      }
    }
  }
}
process.exit(failed ? 1 : 0);
