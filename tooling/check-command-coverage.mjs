// SC-008 enforcement: every command registered in the command registry
// must have at least one Playwright reference. Run after T064 lands the
// registry; until then this script is a no-op that exits 0.
import { access } from "node:fs/promises";

const registryPath = new URL("../packages/core/src/commands/registry.ts", import.meta.url);
try {
  await access(registryPath);
} catch {
  console.log("[check-command-coverage] registry.ts not present yet; skipping");
  process.exit(0);
}

// Real implementation lands with T064/T127a. For now, prove the script
// is wired into CI without false-positive failures.
console.log("[check-command-coverage] placeholder pass (full implementation: T127a)");
process.exit(0);
