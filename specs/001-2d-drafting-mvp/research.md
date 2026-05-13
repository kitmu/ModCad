# Phase 0 Research: 2D Drafting MVP

This document records the decisions made for each open technical
question before Phase 1 implementation begins. Each entry follows
**Decision → Rationale → Rejected alternatives**.

## Geometry predicates and booleans

**Decision** — two-layer geometry stack:

1. **Predicates (unfacaded, pure TS)**: vendor Mapbox
   `robust-predicates` (Shewchuk port, MIT) into
   `packages/core/src/geometry/predicates.ts`. `orient2d`, `incircle`,
   `segIntersect`, `pointOnSeg` are called millions of times per
   frame during snap/pick/hit-test/drag-preview and MUST be zero-FFI.
   Property tests with `fast-check` gate them at 95% line / 100%
   branch coverage.
2. **Booleans / offsets / clipping (Clipper2-WASM behind a facade)**:
   Clipper2 (Boost 1.0, source-available) compiled to WASM, called
   from `packages/core/src/geometry/booleans.ts`. Used for hatch
   boundary generation, offset polylines, polygon union/difference,
   and polygon-from-tangle. Per-command marshaling cost is irrelevant
   because these run at user-command frequency, not per frame.

**Rationale**:
- CAD intersections at near-collinear configurations are the single
  biggest source of corrupted geometry; Shewchuk-style adaptive
  precision is the only well-understood fix.
- Polygon booleans on degenerate input (collinear edges, exact
  touches, near-zero-area slivers) are exactly where `martinez` and
  `polygon-clipping` fall apart in production. Clipper2's Vatti-
  derived implementation with proper ring management is the
  battle-tested choice.
- Splitting the two layers means a single bad Boolean library can be
  swapped without disturbing the millions-per-frame predicate hot
  path.

**Rejected**:
- *Pure IEEE-754 predicates*: produces wrong-side classifications near
  collinear configurations; constitution forbids drawing-corruption.
- *Interval arithmetic everywhere*: ~5× slower; unnecessary for
  non-predicate math.
- *bigjs / decimal.js*: 30× slower; overkill.
- *`martinez` / `polygon-clipping` for booleans*: well-known
  robustness issues on degenerate input — exactly the cases CAD
  users hit constantly.
- *Hand-rolled booleans in TS*: a multi-year project nobody outside
  CGAL has pulled off well; not v1 scope.

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

**Decision (v1)**: A small versioned JSON document, gzipped (`pako`),
extension `.modcad`. Schema is a discriminated union with a `version`
field; unknown fields and unknown entity types round-trip unchanged
when re-saved (FR Edge Case).

**v2 roadmap**: JSON is wasteful for geometry coordinates (15 bytes
per double vs. 8 binary), and `.modcad` files for 50k+ entity
drawings will be 10–30 MB compressed. Candidates for v2:
- **CBOR** (RFC 8949): canonical binary, schema-agnostic, mature TS
  encoders, ~3× smaller than gzipped JSON for coordinate-heavy
  payloads. First choice.
- **MessagePack**: similar to CBOR, slightly less canonical, slightly
  faster decoders. Second choice.
The JSON variant is retained as a debug/diff target indefinitely;
the on-disk default flips when the v2 spec lands.

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

**Precision regime numbers (cross-reference to Constitution
Principle I, three-tier regime)**:

| Tier | Range from local origin | Behavior |
|---|---|---|
| A | `0 – 10⁶` units | Full FP64 precision; all predicates exact; snap radius unbounded; minimum feature size = ULP of inputs |
| B | `10⁶ – 10⁹` units | Precision degrades proportionally to distance from origin; snap radius widened (1 µm at 10⁹); minimum feature size documented per zoom level; predicates remain robust because they rebase to local working frame before evaluating |
| C | `> 10⁹` units | Refused — load issues a warning, no new geometry may be created past this boundary; existing entities load read-only |

**Origin rebase trigger**: when the active viewport's center wanders
past **5×10⁵ units** from the current local origin, the renderer
recenters the world to the viewport center, uploads a delta transform
to the GPU, and the kernel's stored coordinates remain unchanged
(coordinate values in `Drawing` are origin-relative; the rebase
updates the origin not the values).

**GPU FP32 precision**: GPU pipelines use FP32 throughout. Without
rebasing, FP32 dies at ~1e7 in screen space. The rebase guarantees the
visible geometry is always within 5×10⁵ of the local origin, well
below the FP32 break.

This supports civil/infrastructure-scale drawings (2–5 km extent at
mm precision is routine) without compromising mechanical CAD fidelity
at the millimeter or micrometer level.

## i18n

**Decision**: `@formatjs/intl` for message formatting; messages in
`apps/web/src/i18n/en.json`. Extraction via `formatjs` CLI in CI.
English is the only shipped language in v1; the wrapper is in place
so adding a locale is a translation drop-in.
