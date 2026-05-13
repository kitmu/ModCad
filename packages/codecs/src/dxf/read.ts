// Minimal DXF reader for the R2018 subset specified in plan/research.md.
// Supported this round: LINE, LWPOLYLINE, CIRCLE, ARC, POINT, LAYER, LTYPE.
// TODO(Phase 8): MTEXT, DIMENSION, POLYLINE legacy 2D, ELLIPSE.
import {
  newDrawing,
  newId,
  asId,
  type ArcEntity,
  type CircleEntity,
  type Drawing,
  type Entity,
  type Layer,
  type LineEntity,
  type PointEntity,
  type PolylineEntity,
  type PolylineVertex,
  type RGBA,
} from "@modcad/core";

export interface DxfReadResult {
  drawing: Drawing;
  warnings: Array<{ kind: "unsupported-entity"; type: string; count: number }>;
}

/** DXF group: integer code paired with the immediately-following value line. */
interface DxfGroup {
  code: number;
  value: string;
}

/** Tokenize DXF source into (code, value) pairs by reading two lines at a time. */
function tokenize(source: string): DxfGroup[] {
  const lines = source.split(/\r?\n/);
  // Trim a trailing empty line if the file ends with a newline.
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

/** AutoCAD Color Index → approximate RGBA. We only need a sentinel-safe mapping. */
function aciToRGBA(aci: number): RGBA {
  // 0 = ByBlock, 256 = ByLayer → caller decides; for layer color, default to white.
  // Map a handful of standard ACI values; fall back to white for anything else
  // since the round-trip test cares about structural equality, not color fidelity.
  switch (aci) {
    case 1:
      return { r: 1, g: 0, b: 0, a: 1 };
    case 2:
      return { r: 1, g: 1, b: 0, a: 1 };
    case 3:
      return { r: 0, g: 1, b: 0, a: 1 };
    case 4:
      return { r: 0, g: 1, b: 1, a: 1 };
    case 5:
      return { r: 0, g: 0, b: 1, a: 1 };
    case 6:
      return { r: 1, g: 0, b: 1, a: 1 };
    case 7:
      return { r: 1, g: 1, b: 1, a: 1 };
    default:
      return { r: 1, g: 1, b: 1, a: 1 };
  }
}

/** Group an entity's tags into a code → value map (last-wins for repeated codes). */
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
  warnings: Map<string, number>;
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

function parseCircle(
  state: ParserState,
  tags: Map<number, string>,
): CircleEntity {
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

function parsePoint(
  state: ParserState,
  tags: Map<number, string>,
): PointEntity {
  return {
    ...baseFor(state, tags),
    kind: "point",
    p: [num(tags, 10), num(tags, 20)],
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

function parseLayerTable(
  state: ParserState,
  tags: Map<number, string>,
): void {
  const name = str(tags, 2);
  if (!name) return;
  const id = ensureLayer(state, name);
  const layer = state.drawing.layers.find((l) => l.id === id);
  if (!layer) return;
  const aci = num(tags, 62, 7);
  layer.color = aciToRGBA(Math.abs(aci));
  layer.visible = aci >= 0; // negative ACI in LAYER table = off
  const flags = num(tags, 70, 0);
  layer.frozen = (flags & 1) === 1;
  layer.locked = (flags & 4) === 4;
  const lw = tags.get(370);
  if (lw !== undefined) {
    const n = Number.parseFloat(lw);
    // DXF lineweight is in 100ths of mm; -1 = ByLayer (not applicable here),
    // -2 = ByBlock, -3 = default. Keep default for sentinel values.
    if (Number.isFinite(n) && n >= 0) layer.lineweight = n / 100;
  }
}

function bumpWarning(state: ParserState, type: string) {
  state.warnings.set(type, (state.warnings.get(type) ?? 0) + 1);
}

/**
 * Parse the DXF flat-text format. Returns the drawing plus a list of warnings
 * for unsupported entity types so callers can surface them in the UI.
 */
export function readDxf(source: string): DxfReadResult {
  const groups = tokenize(source);
  const drawing = newDrawing();
  // Wipe the auto-created "0" layer so the LAYER table is the source of truth;
  // we'll recreate "0" via ensureLayer if any entity or table references it.
  const initialLayerId = drawing.currentLayerId;
  drawing.layers = [];
  drawing.layerOrder = [];
  const state: ParserState = {
    drawing,
    layersByName: new Map(),
    warnings: new Map(),
  };

  // Walk the group stream. Sections begin with (0, "SECTION") (2, <name>) and
  // end with (0, "ENDSEC"). Tables nest LAYER/LTYPE entries beneath (0, "TABLE").
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
        // LTYPE table entries are accepted but not modeled in v1 — silently OK
        // (they round-trip via the writer's default LTYPE block).
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
          case "MTEXT":
          case "TEXT":
          case "DIMENSION":
          case "POLYLINE":
          case "ELLIPSE":
            bumpWarning(state, v);
            break;
          default:
            bumpWarning(state, v);
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

  // Guarantee a current layer exists. Prefer "0" if any was declared, else
  // either the first table entry or fall back to the auto-created sentinel.
  if (drawing.layers.length === 0) {
    const id = ensureLayer(state, "0");
    drawing.currentLayerId = asId(id);
  } else {
    const zero = state.layersByName.get("0");
    drawing.currentLayerId = asId(zero ?? drawing.layers[0]!.id);
  }
  // The auto-created layer id from newDrawing() is now stale; nothing
  // references it, so no further cleanup is needed.
  void initialLayerId;

  const warnings = Array.from(state.warnings.entries()).map(
    ([type, count]) =>
      ({ kind: "unsupported-entity", type, count }) as const,
  );
  return { drawing, warnings };
}
