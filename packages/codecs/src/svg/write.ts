// SVG writer — FR-018 sibling for vector export.
//
// One <g> per layer in `layerOrder`. Each entity element carries
// `data-modcad-id="<entityId>"` so DOM tests can find it. Colors and
// lineweights resolve through @modcad/core's effectiveColor /
// effectiveLineweight so byLayer is honoured.
//
// Coordinate system: SVG's y-axis grows downward; CAD's grows upward.
// We flip with a `transform="scale(1,-1)"` on the outermost group so
// every entity emits its raw drawing coordinates.
import {
  bboxOfEntities,
  effectiveColor,
  effectiveLineweight,
  isHidden,
  type ArcEntity,
  type CircleEntity,
  type Drawing,
  type EllipseEntity,
  type Entity,
  type Layer,
  type LineEntity,
  type PointEntity,
  type PolylineEntity,
  type RGBA,
  type TextEntity,
  type Vec2Type,
} from "@modcad/core";

export interface SvgWriteOptions {
  paperSize?: [number, number];
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function fmtNum(n: number): string {
  // Match writeDxf's compact-number style; six fractional digits is
  // enough for the precision tiers we model.
  if (Number.isInteger(n)) return n.toFixed(0);
  return Number(n.toFixed(6)).toString();
}

function rgbaToCss(c: RGBA): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgb(${r},${g},${b})`;
}

function entityAttrs(entity: Entity, drawing: Drawing): string {
  const stroke = rgbaToCss(effectiveColor(entity, drawing));
  const lw = effectiveLineweight(entity, drawing);
  return `data-modcad-id="${entity.id}" stroke="${stroke}" stroke-width="${fmtNum(lw)}" fill="none"`;
}

function writeLine(e: LineEntity, drawing: Drawing): string {
  return `<line ${entityAttrs(e, drawing)} x1="${fmtNum(e.a[0])}" y1="${fmtNum(e.a[1])}" x2="${fmtNum(e.b[0])}" y2="${fmtNum(e.b[1])}" />`;
}

function writeCircle(e: CircleEntity, drawing: Drawing): string {
  return `<circle ${entityAttrs(e, drawing)} cx="${fmtNum(e.c[0])}" cy="${fmtNum(e.c[1])}" r="${fmtNum(e.r)}" />`;
}

function writeArc(e: ArcEntity, drawing: Drawing): string {
  const x1 = e.c[0] + e.r * Math.cos(e.startAngle);
  const y1 = e.c[1] + e.r * Math.sin(e.startAngle);
  const x2 = e.c[0] + e.r * Math.cos(e.endAngle);
  const y2 = e.c[1] + e.r * Math.sin(e.endAngle);
  let sweep = e.endAngle - e.startAngle;
  while (sweep < 0) sweep += Math.PI * 2;
  while (sweep > Math.PI * 2) sweep -= Math.PI * 2;
  const largeArc = sweep > Math.PI ? 1 : 0;
  // CCW in math coords; the outer scale(1,-1) flips visually.
  const d = `M ${fmtNum(x1)} ${fmtNum(y1)} A ${fmtNum(e.r)} ${fmtNum(e.r)} 0 ${largeArc} 1 ${fmtNum(x2)} ${fmtNum(y2)}`;
  return `<path ${entityAttrs(e, drawing)} d="${d}" />`;
}

function writePoint(e: PointEntity, drawing: Drawing): string {
  // Render as a degenerate circle so DOM queries see one element per entity.
  return `<circle ${entityAttrs(e, drawing)} cx="${fmtNum(e.p[0])}" cy="${fmtNum(e.p[1])}" r="0.5" />`;
}

function writePolyline(e: PolylineEntity, drawing: Drawing): string {
  // If any vertex has a non-zero bulge, emit a <path> with arc segments.
  const hasBulge = e.vertices.some((v) => v.bulge !== 0);
  if (!hasBulge) {
    const points = e.vertices.map((v) => `${fmtNum(v.p[0])},${fmtNum(v.p[1])}`).join(" ");
    if (e.closed) {
      // Use <polygon> would imply fill; <polyline> + closing segment via path is safer.
      return `<polyline ${entityAttrs(e, drawing)} points="${points} ${fmtNum(e.vertices[0]!.p[0])},${fmtNum(e.vertices[0]!.p[1])}" />`;
    }
    return `<polyline ${entityAttrs(e, drawing)} points="${points}" />`;
  }
  // Path with arc segments: bulge = tan(theta/4) where theta is the
  // included arc angle. Convert each segment.
  const parts: string[] = [];
  for (let i = 0; i < e.vertices.length; i += 1) {
    const v = e.vertices[i]!;
    if (i === 0) {
      parts.push(`M ${fmtNum(v.p[0])} ${fmtNum(v.p[1])}`);
      continue;
    }
    const prev = e.vertices[i - 1]!;
    if (prev.bulge === 0) {
      parts.push(`L ${fmtNum(v.p[0])} ${fmtNum(v.p[1])}`);
      continue;
    }
    const dx = v.p[0] - prev.p[0];
    const dy = v.p[1] - prev.p[1];
    const chord = Math.hypot(dx, dy);
    const theta = 4 * Math.atan(prev.bulge);
    const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
    const largeArc = Math.abs(theta) > Math.PI ? 1 : 0;
    const sweep = prev.bulge > 0 ? 1 : 0;
    parts.push(`A ${fmtNum(radius)} ${fmtNum(radius)} 0 ${largeArc} ${sweep} ${fmtNum(v.p[0])} ${fmtNum(v.p[1])}`);
  }
  if (e.closed) parts.push("Z");
  return `<path ${entityAttrs(e, drawing)} d="${parts.join(" ")}" />`;
}

function writeEllipse(e: EllipseEntity, drawing: Drawing): string {
  const isFull =
    Math.abs(e.startParam) < 1e-9 &&
    Math.abs(e.endParam - Math.PI * 2) < 1e-9;
  const major = Math.hypot(e.major[0], e.major[1]);
  const minor = major * e.ratio;
  const rotDeg = (Math.atan2(e.major[1], e.major[0]) * 180) / Math.PI;
  if (isFull) {
    return `<ellipse ${entityAttrs(e, drawing)} cx="${fmtNum(e.c[0])}" cy="${fmtNum(e.c[1])}" rx="${fmtNum(major)}" ry="${fmtNum(minor)}" transform="rotate(${fmtNum(rotDeg)} ${fmtNum(e.c[0])} ${fmtNum(e.c[1])})" />`;
  }
  // Partial ellipse: parameterise.
  const ux = Math.cos((rotDeg * Math.PI) / 180);
  const uy = Math.sin((rotDeg * Math.PI) / 180);
  const vx = -uy;
  const vy = ux;
  const ptAt = (t: number): Vec2Type => [
    e.c[0] + major * Math.cos(t) * ux + minor * Math.sin(t) * vx,
    e.c[1] + major * Math.cos(t) * uy + minor * Math.sin(t) * vy,
  ];
  const [sx, sy] = ptAt(e.startParam);
  const [ex, ey] = ptAt(e.endParam);
  const sweep = e.endParam - e.startParam;
  const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
  const d = `M ${fmtNum(sx)} ${fmtNum(sy)} A ${fmtNum(major)} ${fmtNum(minor)} ${fmtNum(rotDeg)} ${largeArc} 1 ${fmtNum(ex)} ${fmtNum(ey)}`;
  return `<path ${entityAttrs(e, drawing)} d="${d}" />`;
}

const TEXT_ANCHOR_BY_ALIGN: Record<TextEntity["align"], string> = {
  tl: "start", tc: "middle", tr: "end",
  ml: "start", mc: "middle", mr: "end",
  bl: "start", bc: "middle", br: "end",
};

const DOMINANT_BASELINE_BY_ALIGN: Record<TextEntity["align"], string> = {
  tl: "hanging", tc: "hanging", tr: "hanging",
  ml: "middle", mc: "middle", mr: "middle",
  bl: "alphabetic", bc: "alphabetic", br: "alphabetic",
};

function writeText(e: TextEntity, drawing: Drawing): string {
  const fill = rgbaToCss(effectiveColor(e, drawing));
  // SVG's y-axis is flipped vs CAD; we double-flip inside the outer
  // group so text doesn't render upside-down.
  const rotDeg = (e.rotation * 180) / Math.PI;
  const anchorX = e.anchor[0];
  const anchorY = e.anchor[1];
  const transform = `translate(${fmtNum(anchorX)} ${fmtNum(anchorY)}) scale(1,-1) rotate(${fmtNum(-rotDeg)})`;
  return `<text data-modcad-id="${e.id}" fill="${fill}" font-size="${fmtNum(e.height)}" text-anchor="${TEXT_ANCHOR_BY_ALIGN[e.align]}" dominant-baseline="${DOMINANT_BASELINE_BY_ALIGN[e.align]}" transform="${transform}">${escapeXml(e.value)}</text>`;
}

function entityForLayer(layer: Layer, drawing: Drawing): Entity[] {
  return drawing.entityOrder
    .map((id) => drawing.entities[id])
    .filter((e): e is Entity => !!e && e.layerId === layer.id);
}

function writeEntity(e: Entity, drawing: Drawing): string {
  switch (e.kind) {
    case "line": return writeLine(e, drawing);
    case "circle": return writeCircle(e, drawing);
    case "arc": return writeArc(e, drawing);
    case "point": return writePoint(e, drawing);
    case "polyline": return writePolyline(e, drawing);
    case "ellipse": return writeEllipse(e, drawing);
    case "text": return writeText(e, drawing);
    case "dimension":
      // Dimensions resolve at render time; export as a placeholder so
      // the data-modcad-id lookup still works.
      return `<g data-modcad-id="${e.id}" data-modcad-kind="dimension"></g>`;
  }
}

/**
 * Serialize a Drawing as an SVG document string.
 */
export function writeSvg(drawing: Drawing, opts: SvgWriteOptions = {}): string {
  const entities = drawing.entityOrder
    .map((id) => drawing.entities[id])
    .filter((e): e is Entity => !!e);
  const bbox = entities.length > 0
    ? bboxOfEntities(entities)
    : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const pad = 1;
  const minX = bbox.minX - pad;
  const minY = bbox.minY - pad;
  const width = (bbox.maxX - bbox.minX) + pad * 2;
  const height = (bbox.maxY - bbox.minY) + pad * 2;
  const paper = opts.paperSize;
  const paperAttrs = paper
    ? ` width="${fmtNum(paper[0])}mm" height="${fmtNum(paper[1])}mm"`
    : "";

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmtNum(minX)} ${fmtNum(-(minY + height))} ${fmtNum(width)} ${fmtNum(height)}"${paperAttrs}>`,
  );
  // Outer transform flips the y-axis so CAD-up shows as visual-up.
  parts.push(`<g transform="scale(1,-1)">`);
  for (const layerId of drawing.layerOrder) {
    const layer = drawing.layers.find((l) => l.id === layerId);
    if (!layer) continue;
    const layerEntities = entityForLayer(layer, drawing).filter(
      (e) => !isHidden(e, drawing),
    );
    parts.push(
      `<g data-modcad-layer="${escapeXml(layer.name)}" data-modcad-layer-id="${layer.id}">`,
    );
    for (const e of layerEntities) parts.push(writeEntity(e, drawing));
    parts.push(`</g>`);
  }
  parts.push(`</g>`);
  parts.push(`</svg>`);
  return parts.join("");
}
