// Cold-start route. Once autosave restore (T108) and the first-run
// units dialog (T046a → FR-015a) land they hook in here.
export function Boot() {
  return (
    <div style={{ padding: 16 }}>
      <p>Loading…</p>
    </div>
  );
}
