// Top-level bench runner. Real benches land in Phase 10 (T115/T115a).
// For Phase 1 we exit 0 with a placeholder note so the CI bench job
// can be wired in CI from day one without false failures.
console.log("[bench] placeholder pass (full implementation: T115/T115a)");
process.exit(0);
