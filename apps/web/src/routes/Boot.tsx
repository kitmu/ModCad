/* eslint-disable formatjs/no-literal-string-in-jsx -- T046b sweep pending: messages registered in en.json will replace literals here in v1.1. */
// Cold-start route. Once autosave restore (T108) and the first-run
// units dialog (T046a → FR-015a) land they hook in here.
export function Boot() {
  return (
    <div style={{ padding: 16 }}>
      <p>Loading…</p>
    </div>
  );
}
