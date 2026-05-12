# Phase 0 Research: 2D Drafting MVP

This document records the decisions made for each open technical
question before Phase 1 implementation begins. Each entry follows
**Decision → Rationale → Rejected alternatives**.

## Geometry predicates

**Decision**: Port the Shewchuk adaptive precision predicates
(`orient2d`, `incircle`, `insphere`) to TypeScript, packaged in
`packages/core/geometry/predicates.ts`. Use them everywhere we need
exact orientation or in-circle tests; use ordinary IEEE-754 for
non-degenerate arithmetic.

**Rationale**: CAD intersections at near-collinear configurations are
the single biggest source of corrupted geometry. Shewchuk's
double-double expansions stay exact until the answer is unambiguous,
falling through to fast paths when inputs are not pathological.
TypeScript ports exist as reference (Mapbox `robust-predicates`,
MIT-licensed) — we'll vendor that and add property tests.

**Rejected**:
- *Pure IEEE-754*: produces wrong-side classifications near collinear
  configurations; the constitution forbids drawing-corruption bugs.
- *Interval arithmetic everywhere*: ~5× slower and we don't need it
  for non-predicate math.
- *bigjs / decimal.js*: 30× slower; overkill.

## DXF reader/writer

**Decision**: Hand-rolled reader for the documented R2018 entity
subset; hand-rolled writer with golden-file regression tests against
the canonical fixture. Both live in `packages/codecs/dxf/`. Run in a
Web Worker via comlink so large files don't block the main thread.

**Rationale**:
- Coverage scope is fixed by the spec (FR-017, FR-019): LINE,
  LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, TEXT, MTEXT, DIMENSION,
  LAYER, LTYPE. A hand-rolled reader for that subset is ~1500 LoC,
  trivial to fuzz, and produces our types directly without an
  intermediate AST.
- `libredwg-web` is LGPL — viable but adds a 4 MB WASM bundle and an
  AST adapter layer; overkill for the subset we want.
- `dxf-parser` is MIT and read-only; we'd still need a writer.

**Rejected**:
- `libredwg-web`: bundle weight, licensing review overhead.
- `dxf-parser` + custom writer: extra adapter layer for marginal
  reader savings.

## Text rendering

**Decision**: Bundle a small set of permissively-licensed fonts
(Inter for sans, JetBrains Mono for mono, Noto Sans for CJK fallback)
and render text via a signed-distance-field atlas generated at build
time. Glyph layout uses HarfBuzz-WASM lazy-loaded only when shaping
is needed (CJK, complex Indic). Canvas2D measure-only paths are used
for the i18n debug overlay.

**Rationale**:
- SDF gives crisp glyph rendering at any zoom level on GPU.
- Bundled fonts side-step the DXF missing-font edge case for the
  default style.
- HarfBuzz lazy-load keeps cold-load budget under SC-005.

**Rejected**:
- *System fonts only*: causes plot-time differences across machines
  and breaks DXF text fidelity.
- *Bitmap font atlases*: poor at fractional zoom.

## Spatial index

**Decision**: Two-tier — `flatbush` (immutable static R-tree, rebuilt
on every command commit) for view culling and selection raycasts;
`rbush` (mutable R-tree) for the small live edit set during a
multi-step command. Both wrapped in `packages/core/index`.

**Rationale**: Commit happens once per user command; rebuilds with
flatbush are microseconds for 50k entities. The mutable rbush
absorbs intra-command churn without thrashing the cold index.

**Rejected**:
- *Single mutable rbush*: slower view culling on the 50k bench.
- *KD-tree*: rebalancing complexity not worth it for 2D AABBs.

## Renderer parity

**Decision**: A single declarative scene-graph API in
`packages/renderer/api.ts`; WebGPU and WebGL2 backends both implement
it. A CI render-parity test renders the canonical 50k scene with each
backend off-screen and compares with a tolerance of ≤1 channel on
≤0.05% of pixels.

**Rationale**: The constitution mandates "identical results on both."
A pixel test is the cheapest enforceable definition; smaller
tolerances would fail on legitimate MSAA differences across drivers.

## PDF export

**Decision**: `pdf-lib` (MIT, no native deps) for vector PDF
assembly. Layers map to PDF Optional Content Groups. Text uses
font-subsetting via `pdf-lib`'s `embedFont(..., { subset: true })`.
Raster fallback per FR-018 is reserved for future raster image
inserts; v1 ships pure vector.

**Rejected**:
- *PDFKit* (web build): heavier, awkward API for OCG layers.
- *jsPDF*: weaker for text + OCG.

## State management

**Decision**: Zustand with a single store per drawing tab, sliced into
selectors (`useCommandBus`, `useSelection`, `useLayers`, etc.). The
*drawing data itself* (entities, layers) lives in `packages/core` and
is referenced by the store; the store holds UI-only state plus a
reference + version number that drives re-renders.

**Rejected**:
- *Redux*: ceremony for no benefit; we have no time-travel needs
  beyond what the command bus already gives us.
- *Jotai*: per-atom subscriptions are nice but no single Drawing-
  level store gets unwieldy at v1 size.

## File format `.modcad`

**Decision**: A small versioned JSON document, gzipped (`pako`),
extension `.modcad`. Schema is a discriminated union with a `version`
field; unknown fields and unknown entity types round-trip unchanged
when re-saved (FR Edge Case).

```jsonc
{
  "format": "modcad",
  "version": "1.0",
  "drawing": {
    "units": "mm",
    "precision": 3,
    "layers": [ /* … */ ],
    "entities": [ /* … */ ],
    "settings": { /* … */ }
  },
  "extra": { /* preserved as-is on round-trip */ }
}
```

## Robust line dashing and arc tessellation on GPU

**Decision**: Dashes are computed in the vertex shader from the
camera-space arc-length parameter, not pre-baked into geometry, so
that zooming does not re-tessellate. Arcs are emitted as instanced
quads with the analytic distance to the curve in the fragment
shader, anti-aliased per-pixel. Same technique on both backends.

**Rejected**: Pre-tessellated polylines (sufficient at one zoom level
but blow out memory and fidelity at others).

## Coordinate precision

**Decision**: All geometry stored in double-precision JS numbers.
Each drawing has an optional `originOffset: Vec2` rebased to the
viewport center when the cursor wanders >5×10^5 units from the
current origin. Predicates always operate on rebased local
coordinates. Rebase commits a single `OriginRebaseCommand` to the
undo stack with a no-op user-visible effect.

**Rationale**: Float precision degrades around 1e7; CAD users zoom
in to site-scale all the time. Rebasing keeps numerical headroom and
is invisible to user-facing coordinates.

## i18n

**Decision**: `@formatjs/intl` for message formatting; messages in
`apps/web/src/i18n/en.json`. Extraction via `formatjs` CLI in CI.
English is the only shipped language in v1; the wrapper is in place
so adding a locale is a translation drop-in.
