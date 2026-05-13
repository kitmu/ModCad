// DXF R2018 reader for the spec subset.
// Supported: LINE, LWPOLYLINE, POLYLINE (legacy 2D), CIRCLE, ARC, ELLIPSE,
// POINT, TEXT, MTEXT, DIMENSION (linear/aligned/angular/radial/diameter),
// LAYER, LTYPE.
//
// TODO(Phase 8 worker boundary): the tokenize → parse pipeline below is
// pure CPU and called synchronously from the main thread. When parse
// time on real-world drawings starts to matter, move `readDxf` behind a
// comlink-style worker proxy (the worker entry is the obvious split:
// post the source string in, post `DxfReadResult` back). The reader's
// API is already structured to make that drop-in.
import {
  newDrawing,
  newId,
  asId,
  type ArcEntity,
  type CircleEntity,
  type DimensionEntity,
  type DimensionRef,
  type Drawing,
  type EllipseEntity,
  type Entity,
  type Layer,
  type LineEntity,
  type PointEntity,
  type PolylineEntity,
  type PolylineVertex,
  type RGBA,
  type TextEntity,
  type Vec2Type,
} from "@modcad/core";

/** Recognized warning kinds. The UI groups by `kind`+`detail` for display. */
export type DxfWarning =
  | { kind: "unsupported-entity"; type: string; count: number }
  | { kind: "mtext-formatting-stripped"; count: number }
  | { kind: "missing-font"; font: string }
  | { kind: "unresolved-dimension-ref"; count: number };

export interface DxfReadResult {
  drawing: Drawing;
  warnings: DxfWarning[];
}

/** Fonts the host knows how to render. Anything else falls back to default. */
const BUNDLED_FONTS = new Set<string>([
  "STANDARD",
  "ARIAL",
  "HELVETICA",
  "TIMES",
  "TIMES NEW ROMAN",
  "COURIER",
  "COURIER NEW",
]);
const DEFAULT_FONT = "STANDARD";

/** DXF group: integer code paired with the immediately-following value line. */
interface DxfGroup {
  code: number;
  value: string;
}

/** Tokenize DXF source into (code, value) pairs by reading two lines at a time. */
function tokenize(source: string): DxfGroup[] {
  const lines = source.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const groups: DxfGroup[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeStr = (lines[i] ?? "").trim();
    const value = lines[i + 1] ?? "";
    const code = Number.parseInt(codeStr, 10);
    if (!Number.isFinite(code)) {
      throw new Error(`invalid DXF group code at line ${i + 1}: ${codeStr}`);
    }
    groups.push({ code, value });
  }
  return groups;
}

/** AutoCAD Color Index → approximate RGBA. */
function aciToRGBA(aci: number): RGBA {
  switch (aci) {
    case 1: return { r: 1, g: 0, b: 0, a: 1 };
    case 2: return { r: 1, g: 1, b: 0, a: 1 };
    case 3: return { r: 0, g: 1, b: 0, a: 1 };
    case 4: return { r: 0, g: 1, b: 1, a: 1 };
    case 5: return { r: 0, g: 0, b: 1, a: 1 };
    case 6: return { r: 1, g: 0, b: 1, a: 1 };
    case 7: return { r: 1, g: 1, b: 1, a: 1 };
    default: return { r: 1, g: 1, b: 1, a: 1 };
  }
}

function collectTags(groups: DxfGroup[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const g of groups) m.set(g.code, g.value);
  return m;
}

function num(tags: Map<number, string>, code: number, fallback = 0): number {
  const v = tags.get(code);
  if (v === undefined) return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(tags: Map<number, string>, code: number, fallback = ""): string {
  return tags.get(code) ?? fallback;
}

interface ParserState {
  drawing: Drawing;
  /** layer name → layer id, populated as LAYER table entries are seen. */
  layersByName: Map<string, string>;
  unsupported: Map<string, number>;
  mtextFormattingCount: number;
  missingFonts: Set<string>;
  unresolvedDimensionRefs: number;
}

function ensureLayer(state: ParserState, name: string): string {
  const existing = state.layersByName.get(name);
  if (existing) return existing;
  const layer: Layer = {
    id: newId(),
    name,
    color: { r: 1, g: 1, b: 1, a: 1 },
    lineweight: 0.25,
    visible: true,
    locked: false,
    frozen: false,
  };
  state.drawing.layers.push(layer);
  state.drawing.layerOrder.push(layer.id);
  state.layersByName.set(name, layer.id);
  return layer.id;
}

function entityLayerId(state: ParserState, tags: Map<number, string>): string {
  const name = str(tags, 8, "0");
  return ensureLayer(state, name);
}

function baseFor(state: ParserState, tags: Map<number, string>): {
  id: ReturnType<typeof newId>;
  layerId: ReturnType<typeof asId>;
  color: "byLayer";
  lineweight: "byLayer";
} {
  return {
    id: newId(),
    layerId: asId(entityLayerId(state, tags)),
    color: "byLayer",
    lineweight: "byLayer",
  };
}

function parseLine(state: ParserState, tags: Map<number, string>): LineEntity {
  return {
    ...baseFor(state, tags),
    kind: "line",
    a: [num(tags, 10), num(tags, 20)],
    b: [num(tags, 11), num(tags, 21)],
  };
}

function parseCircle(state: ParserState, tags: Map<number, string>): CircleEntity {
  return {
    ...baseFor(state, tags),
    kind: "circle",
    c: [num(tags, 10), num(tags, 20)],
    r: num(tags, 40),
  };
}

function parseArc(state: ParserState, tags: Map<number, string>): ArcEntity {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  return {
    ...baseFor(state, tags),
    kind: "arc",
    c: [num(tags, 10), num(tags, 20)],
    r: num(tags, 40),
    startAngle: toRad(num(tags, 50)),
    endAngle: toRad(num(tags, 51)),
  };
}

function parsePoint(state: ParserState, tags: Map<number, string>): PointEntity {
  return {
    ...baseFor(state, tags),
    kind: "point",
    p: [num(tags, 10), num(tags, 20)],
  };
}

function parseEllipse(
  state: ParserState,
  tags: Map<number, string>,
): EllipseEntity {
  return {
    ...baseFor(state, tags),
    kind: "ellipse",
    c: [num(tags, 10), num(tags, 20)],
    major: [num(tags, 11), num(tags, 21)],
    ratio: num(tags, 40, 1),
    startParam: num(tags, 41, 0),
    endParam: num(tags, 42, Math.PI * 2),
  };
}

/**
 * LWPOLYLINE has repeated 10/20/42 groups, one per vertex. `collectTags` would
 * collapse them last-wins; re-walk the groups for this entity instead.
 */
function parseLwPolyline(
  state: ParserState,
  groups: DxfGroup[],
): PolylineEntity {
  const tags = collectTags(groups);
  const vertices: PolylineVertex[] = [];
  let pending: { x?: number; y?: number; bulge: number } = { bulge: 0 };
  const flush = () => {
    if (pending.x !== undefined && pending.y !== undefined) {
      vertices.push({ p: [pending.x, pending.y], bulge: pending.bulge });
    }
    pending = { bulge: 0 };
  };
  for (const g of groups) {
    if (g.code === 10) {
      if (pending.x !== undefined) flush();
      pending.x = Number.parseFloat(g.value);
    } else if (g.code === 20) {
      pending.y = Number.parseFloat(g.value);
    } else if (g.code === 42) {
      pending.bulge = Number.parseFloat(g.value);
    }
  }
  flush();
  const flags = num(tags, 70);
  return {
    ...baseFor(state, tags),
    kind: "polyline",
    vertices,
    closed: (flags & 1) === 1,
  };
}

/**
 * Strip MTEXT inline formatting codes (`\C` color, `\H` height, `\f` font,
 * `\P` paragraph break, `\~` non-breaking space, `{...}` groups, `\\`).
 * Bumps a single warning counter so we can surface "{n} MTEXT formatting
 * codes stripped" once at the end of parse.
 */
function stripMtextFormatting(raw: string, state: ParserState): string {
  let out = "";
  let i = 0;
  let stripped = 0;
  while (i < raw.length) {
    const ch = raw[i] ?? "";
    if (ch === "\\") {
      const nxt = raw[i + 1] ?? "";
      // \\ → literal backslash
      if (nxt === "\\") { out += "\\"; i += 2; continue; }
      // \P / \p → newline (preserve content, not formatting → don't count)
      if (nxt === "P" || nxt === "p") { out += "\n"; i += 2; continue; }
      // \~ → non-breaking space (preserve content)
      if (nxt === "~") { out += " "; i += 2; continue; }
      // \C<n>; → color; \H<n>x?; → height; \f<...>; → font; etc.
      if (/[A-Za-z]/.test(nxt)) {
        // Consume up to and including the next semicolon (or end).
        i += 2;
        while (i < raw.length && raw[i] !== ";") i += 1;
        if (i < raw.length) i += 1;
        stripped += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "{" || ch === "}") {
      // Grouping braces — drop them but don't count.
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  state.mtextFormattingCount += stripped;
  return out;
}

/**
 * Concatenate MTEXT primary value (1) with any continuation chunks (3).
 * DXF group 3 carries text that overflows the 250-char primary line.
 */
function mtextValue(groups: DxfGroup[]): string {
  const parts: string[] = [];
  const continuation: string[] = [];
  for (const g of groups) {
    if (g.code === 3) continuation.push(g.value);
    if (g.code === 1) parts.push(g.value);
  }
  // Continuation chunks come *before* the main 1-value per DXF spec.
  return continuation.join("") + parts.join("");
}

function dxfAlignFromCodes(halign: number, valign: number): TextEntity["align"] {
  // DXF group 72 (horizontal): 0 left, 1 center, 2 right, 3 aligned, 4 middle, 5 fit
  // DXF group 73 (vertical): 0 baseline, 1 bottom, 2 middle, 3 top
  const h = halign === 1 || halign === 4 ? "c" : halign === 2 ? "r" : "l";
  const v = valign === 3 ? "t" : valign === 2 || valign === 4 ? "m" : "b";
  // For our Text type the prefix is vertical, suffix horizontal.
  return `${v}${h}` as TextEntity["align"];
}

function mtextAlignFromAttach(attach: number): TextEntity["align"] {
  // MTEXT attachment point (group 71):
  // 1 TL  2 TC  3 TR  4 ML  5 MC  6 MR  7 BL  8 BC  9 BR
  const map: TextEntity["align"][] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];
  const idx = Math.min(Math.max(attach, 1), 9) - 1;
  return map[idx] ?? "bl";
}

function parseText(state: ParserState, tags: Map<number, string>): TextEntity {
  const value = str(tags, 1, "");
  const font = (str(tags, 7, DEFAULT_FONT) || DEFAULT_FONT).toUpperCase();
  if (font && !BUNDLED_FONTS.has(font)) {
    state.missingFonts.add(font);
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const halign = Math.trunc(num(tags, 72, 0));
  const valign = Math.trunc(num(tags, 73, 0));
  // When justified, the secondary alignment point (11/21) is the anchor;
  // otherwise (10/20) is. We keep the simple form — anchor is always (10/20).
  return {
    ...baseFor(state, tags),
    kind: "text",
    anchor: [num(tags, 10), num(tags, 20)],
    height: num(tags, 40, 1),
    rotation: toRad(num(tags, 50, 0)),
    align: dxfAlignFromCodes(halign, valign),
    value,
    styleId: asId(font),
  };
}

function parseMtext(
  state: ParserState,
  groups: DxfGroup[],
): TextEntity {
  const tags = collectTags(groups);
  const rawValue = mtextValue(groups);
  const value = stripMtextFormatting(rawValue, state);
  const font = (str(tags, 7, DEFAULT_FONT) || DEFAULT_FONT).toUpperCase();
  if (font && !BUNDLED_FONTS.has(font)) {
    state.missingFonts.add(font);
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const attach = Math.trunc(num(tags, 71, 7));
  return {
    ...baseFor(state, tags),
    kind: "text",
    anchor: [num(tags, 10), num(tags, 20)],
    height: num(tags, 40, 1),
    rotation: toRad(num(tags, 50, 0)),
    align: mtextAlignFromAttach(attach),
    value,
    styleId: asId(font),
  };
}

/**
 * Legacy POLYLINE: a header entity followed by N VERTEX entities and a
 * terminating SEQEND. Convert to LWPOLYLINE-compatible bulged vertices.
 *
 * The caller hands us *just* the header's tags and then we drain the
 * following VERTEX/SEQEND entities from `groups` starting at `start`.
 * Returns the new index just past SEQEND and the parsed entity.
 */
function parseLegacyPolyline(
  state: ParserState,
  headerTags: Map<number, string>,
  groups: DxfGroup[],
  start: number,
): { entity: PolylineEntity; nextIndex: number } {
  const vertices: PolylineVertex[] = [];
  const flags = num(headerTags, 70);
  let i = start;
  while (i < groups.length) {
    const g = groups[i];
    if (!g) break;
    if (g.code === 0) {
      if (g.value === "SEQEND") {
        // Skip the SEQEND's own attribute groups (rare but possible).
        i += 1;
        while (i < groups.length && groups[i]!.code !== 0) i += 1;
        break;
      }
      if (g.value === "VERTEX") {
        // Collect this VERTEX's tags until the next 0-group.
        const vStart = i + 1;
        let vEnd = vStart;
        while (vEnd < groups.length && groups[vEnd]!.code !== 0) vEnd += 1;
        const vTags = collectTags(groups.slice(vStart, vEnd));
        vertices.push({
          p: [num(vTags, 10), num(vTags, 20)],
          bulge: num(vTags, 42, 0),
        });
        i = vEnd;
        continue;
      }
      // Any other 0-entry inside a POLYLINE is unexpected — bail.
      break;
    }
    i += 1;
  }
  const entity: PolylineEntity = {
    ...baseFor(state, headerTags),
    kind: "polyline",
    vertices,
    closed: (flags & 1) === 1,
  };
  return { entity, nextIndex: i };
}

function vec2(tags: Map<number, string>, xCode: number, yCode: number): Vec2Type {
  return [num(tags, xCode), num(tags, yCode)];
}

/**
 * Parse a DIMENSION header into our DimensionEntity. We bind absolute
 * point anchors; binding to entity references is not done here (the
 * importer has no way to know which previously-imported entity a
 * dimension was originally referring to without ACDB handles, which
 * we don't preserve). Every dimension counts as one
 * `unresolved-dimension-ref` warning so the UI can surface FR-019.
 */
function parseDimension(
  state: ParserState,
  tags: Map<number, string>,
): DimensionEntity {
  // Group 70 contains the dimension type bitfield. Low 5 bits = variant.
  // 0 = rotated/linear, 1 = aligned, 2 = angular (3 pts), 3 = diameter,
  // 4 = radius, 5 = angular (3 pts via 3 lines), 6 = ordinate.
  const flags = Math.trunc(num(tags, 70, 0));
  const variantBits = flags & 0x1f;
  state.unresolvedDimensionRefs += 1;

  // Common anchor points used by most variants.
  const def: Vec2Type = vec2(tags, 10, 20); // dimension line definition point
  const text: Vec2Type = vec2(tags, 11, 21); // text mid point (unused — we keep `def`)
  const ext1: Vec2Type = vec2(tags, 13, 23);
  const ext2: Vec2Type = vec2(tags, 14, 24);
  const center: Vec2Type = vec2(tags, 15, 25);
  void text;

  let refs: DimensionRef;
  let variant: DimensionEntity["variant"];
  switch (variantBits) {
    case 1:
      variant = "aligned";
      refs = { variant: "aligned", a: ext1, b: ext2 };
      break;
    case 2:
    case 5:
      variant = "angular";
      refs = { variant: "angular", v: def, a: ext1, b: ext2 };
      break;
    case 3:
      variant = "diameter";
      // Diameter has no entity binding here — we synthesize a placeholder
      // id; downstream consumers treat it as a Vec2-only annotation by
      // matching on the dimension's `refs.variant` and the
      // unresolved-dimension-ref warning.
      refs = { variant: "diameter", entity: asId("") };
      break;
    case 4:
      variant = "radial";
      refs = { variant: "radial", entity: asId("") };
      break;
    case 0:
    default: {
      variant = "linear";
      // Group 50 carries rotation in degrees for rotated linear dims;
      // 0 / 180 ≈ x-axis dimension, 90 / 270 ≈ y-axis.
      const rot = num(tags, 50, 0) % 180;
      const axis: "x" | "y" = Math.abs(rot - 90) < 45 ? "y" : "x";
      refs = { variant: "linear", a: ext1, b: ext2, axis };
      break;
    }
  }

  // Offset distance from definition anchor → text mid. We don't need
  // surveyor-grade precision; the magnitude is what matters for layout.
  const dx = def[0] - center[0];
  const dy = def[1] - center[1];
  const offset = Math.hypot(dx, dy);

  return {
    ...baseFor(state, tags),
    kind: "dimension",
    variant,
    refs,
    offset,
    styleId: asId(str(tags, 3, "STANDARD") || "STANDARD"),
  };
}

function parseLayerTable(state: ParserState, tags: Map<number, string>): void {
  const name = str(tags, 2);
  if (!name) return;
  const id = ensureLayer(state, name);
  const layer = state.drawing.layers.find((l) => l.id === id);
  if (!layer) return;
  const aci = num(tags, 62, 7);
  layer.color = aciToRGBA(Math.abs(aci));
  layer.visible = aci >= 0;
  const flags = num(tags, 70, 0);
  layer.frozen = (flags & 1) === 1;
  layer.locked = (flags & 4) === 4;
  const lw = tags.get(370);
  if (lw !== undefined) {
    const n = Number.parseFloat(lw);
    if (Number.isFinite(n) && n >= 0) layer.lineweight = n / 100;
  }
}

function bumpUnsupported(state: ParserState, type: string) {
  state.unsupported.set(type, (state.unsupported.get(type) ?? 0) + 1);
}

/**
 * Parse DXF flat-text format. Returns the drawing plus a list of warnings.
 */
export function readDxf(source: string): DxfReadResult {
  const groups = tokenize(source);
  const drawing = newDrawing();
  // Wipe the auto-created "0" layer so the LAYER table is the source of truth.
  const initialLayerId = drawing.currentLayerId;
  drawing.layers = [];
  drawing.layerOrder = [];
  const state: ParserState = {
    drawing,
    layersByName: new Map(),
    unsupported: new Map(),
    mtextFormattingCount: 0,
    missingFonts: new Set(),
    unresolvedDimensionRefs: 0,
  };

  let i = 0;
  let section: string | null = null;
  let table: string | null = null;
  while (i < groups.length) {
    const g = groups[i]!;
    if (g.code === 0) {
      const v = g.value;
      if (v === "SECTION") {
        const next = groups[i + 1];
        if (next && next.code === 2) section = next.value;
        i += 2;
        continue;
      }
      if (v === "ENDSEC") {
        section = null;
        table = null;
        i += 1;
        continue;
      }
      if (v === "TABLE" && section === "TABLES") {
        const next = groups[i + 1];
        if (next && next.code === 2) table = next.value;
        i += 2;
        continue;
      }
      if (v === "ENDTAB") {
        table = null;
        i += 1;
        continue;
      }
      if (v === "EOF") break;

      // Gather all tags for this entity/table-entry until the next 0-group.
      const start = i + 1;
      let end = start;
      while (end < groups.length && groups[end]!.code !== 0) end += 1;
      const entityGroups = groups.slice(start, end);
      const tags = collectTags(entityGroups);

      if (section === "TABLES" && table === "LAYER" && v === "LAYER") {
        parseLayerTable(state, tags);
      } else if (section === "TABLES" && table === "LTYPE" && v === "LTYPE") {
        // LTYPE entries accepted but not modeled in v1 — silently OK.
      } else if (section === "ENTITIES") {
        let entity: Entity | null = null;
        switch (v) {
          case "LINE":
            entity = parseLine(state, tags);
            break;
          case "CIRCLE":
            entity = parseCircle(state, tags);
            break;
          case "ARC":
            entity = parseArc(state, tags);
            break;
          case "POINT":
            entity = parsePoint(state, tags);
            break;
          case "LWPOLYLINE":
            entity = parseLwPolyline(state, entityGroups);
            break;
          case "POLYLINE": {
            // Legacy POLYLINE: VERTEX entries follow until SEQEND.
            const { entity: poly, nextIndex } = parseLegacyPolyline(
              state,
              tags,
              groups,
              end,
            );
            entity = poly;
            end = nextIndex;
            break;
          }
          case "ELLIPSE":
            entity = parseEllipse(state, tags);
            break;
          case "TEXT":
            entity = parseText(state, tags);
            break;
          case "MTEXT":
            entity = parseMtext(state, entityGroups);
            break;
          case "DIMENSION":
            entity = parseDimension(state, tags);
            break;
          default:
            bumpUnsupported(state, v);
            break;
        }
        if (entity) {
          drawing.entities[entity.id] = entity;
          drawing.entityOrder.push(entity.id);
        }
      }
      i = end;
      continue;
    }
    i += 1;
  }

  // Guarantee a current layer exists.
  if (drawing.layers.length === 0) {
    const id = ensureLayer(state, "0");
    drawing.currentLayerId = asId(id);
  } else {
    const zero = state.layersByName.get("0");
    drawing.currentLayerId = asId(zero ?? drawing.layers[0]!.id);
  }
  void initialLayerId;

  const warnings: DxfWarning[] = [];
  for (const [type, count] of state.unsupported)
    warnings.push({ kind: "unsupported-entity", type, count });
  if (state.mtextFormattingCount > 0)
    warnings.push({ kind: "mtext-formatting-stripped", count: state.mtextFormattingCount });
  for (const font of state.missingFonts)
    warnings.push({ kind: "missing-font", font });
  if (state.unresolvedDimensionRefs > 0)
    warnings.push({ kind: "unresolved-dimension-ref", count: state.unresolvedDimensionRefs });

  return { drawing, warnings };
}
