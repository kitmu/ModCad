// PDF writer — FR-018. Every entity emits a real PDF path (vector by
// default; raster fallback hook reserved). Layers are wrapped in PDF
// marked-content sequences tagged /OC <name> so the layer panel in
// downstream viewers can show/hide them.
//
// pdf-lib gives us `drawLine`, `drawCircle`, `drawEllipse`, `drawText`,
// `drawSvgPath`, and `pushOperators` for raw operators. We use
// `drawSvgPath` for arcs, polylines, and partial ellipses so we don't
// have to reimplement bezier-from-arc; SVG path syntax is the lingua
// franca pdf-lib already speaks.
import {
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
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
  type LineEntity,
  type PointEntity,
  type PolylineEntity,
  type RGBA,
  type TextEntity,
  type Vec2Type,
} from "@modcad/core";

export type PaperSizeName = "A4" | "Letter" | "A3";
export type PaperSize = PaperSizeName | [number, number];

export interface PdfWriteOptions {
  paperSize?: PaperSize;
  orientation?: "portrait" | "landscape";
}

// Paper sizes in millimetres.
const PAPER_MM: Record<PaperSizeName, [number, number]> = {
  A4: [210, 297],
  Letter: [216, 279],
  A3: [297, 420],
};

// 1 mm = 72/25.4 PDF points.
const MM_TO_PT = 72 / 25.4;

function resolvePaper(opts: PdfWriteOptions): [number, number] {
  const raw = opts.paperSize ?? "A4";
  const mm: [number, number] = Array.isArray(raw) ? [raw[0], raw[1]] : PAPER_MM[raw];
  const [w, h] = opts.orientation === "landscape" ? [mm[1], mm[0]] : mm;
  return [w * MM_TO_PT, h * MM_TO_PT];
}

function pdfColor(c: RGBA): ReturnType<typeof rgb> {
  return rgb(c.r, c.g, c.b);
}

function svgArcPath(arc: ArcEntity): string {
  const x1 = arc.c[0] + arc.r * Math.cos(arc.startAngle);
  const y1 = arc.c[1] + arc.r * Math.sin(arc.startAngle);
  const x2 = arc.c[0] + arc.r * Math.cos(arc.endAngle);
  const y2 = arc.c[1] + arc.r * Math.sin(arc.endAngle);
  let sweep = arc.endAngle - arc.startAngle;
  while (sweep < 0) sweep += Math.PI * 2;
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${arc.r} ${arc.r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function svgPolylinePath(p: PolylineEntity): string {
  const parts: string[] = [];
  for (let i = 0; i < p.vertices.length; i += 1) {
    const v = p.vertices[i]!;
    if (i === 0) { parts.push(`M ${v.p[0]} ${v.p[1]}`); continue; }
    const prev = p.vertices[i - 1]!;
    if (prev.bulge === 0) { parts.push(`L ${v.p[0]} ${v.p[1]}`); continue; }
    const chord = Math.hypot(v.p[0] - prev.p[0], v.p[1] - prev.p[1]);
    const theta = 4 * Math.atan(prev.bulge);
    const radius = Math.abs(chord / (2 * Math.sin(theta / 2)));
    const largeArc = Math.abs(theta) > Math.PI ? 1 : 0;
    const sweep = prev.bulge > 0 ? 1 : 0;
    parts.push(`A ${radius} ${radius} 0 ${largeArc} ${sweep} ${v.p[0]} ${v.p[1]}`);
  }
  if (p.closed) parts.push("Z");
  return parts.join(" ");
}

function svgPartialEllipsePath(e: EllipseEntity): string {
  const major = Math.hypot(e.major[0], e.major[1]);
  const minor = major * e.ratio;
  const rotDeg = (Math.atan2(e.major[1], e.major[0]) * 180) / Math.PI;
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
  return `M ${sx} ${sy} A ${major} ${minor} ${rotDeg} ${largeArc} 1 ${ex} ${ey}`;
}

/** Compute fit-to-page transform so the drawing bbox lands inside the paper. */
function fitTransform(
  drawing: Drawing,
  paperPt: [number, number],
): { scale: number; tx: number; ty: number } {
  const entities = drawing.entityOrder
    .map((id) => drawing.entities[id])
    .filter((e): e is Entity => !!e);
  if (entities.length === 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const bbox = bboxOfEntities(entities);
  const margin = 36; // 0.5"
  const drawW = Math.max(bbox.maxX - bbox.minX, 1);
  const drawH = Math.max(bbox.maxY - bbox.minY, 1);
  const usableW = paperPt[0] - margin * 2;
  const usableH = paperPt[1] - margin * 2;
  const scale = Math.min(usableW / drawW, usableH / drawH);
  const tx = margin - bbox.minX * scale + (usableW - drawW * scale) / 2;
  const ty = margin - bbox.minY * scale + (usableH - drawH * scale) / 2;
  return { scale, tx, ty };
}

function strokeWidthForEntity(e: Entity, drawing: Drawing, scale: number): number {
  // Lineweight is in mm; convert to PDF points scaled by the fit transform.
  // We clamp to a minimum so hairline strokes still print.
  const lwMm = effectiveLineweight(e, drawing);
  return Math.max(lwMm * MM_TO_PT, 0.1) / scale;
}

/**
 * Register one OCG per visible layer. Returns the table the entity loop
 * uses to emit /OC markers. The /Properties resource ties the marker
 * name back to the OCG dictionary.
 */
function registerOcgs(
  doc: PDFDocument,
  page: PDFPage,
  drawing: Drawing,
): Map<string, { propName: PDFName }> {
  const ocgsArr: import("pdf-lib").PDFRef[] = [];
  const properties: Record<string, import("pdf-lib").PDFRef> = {};
  const out = new Map<string, { propName: PDFName }>();
  for (const layer of drawing.layers) {
    const dict = doc.context.obj({
      Type: "OCG",
      Name: PDFString.of(layer.name),
    });
    const ref = doc.context.register(dict);
    ocgsArr.push(ref);
    const propKey = `MC${layer.id.slice(-8)}`;
    properties[propKey] = ref;
    out.set(layer.id, { propName: PDFName.of(propKey) });
  }
  if (ocgsArr.length === 0) return out;

  // Attach the OCProperties to the catalog so Acrobat shows the layers panel.
  const ocgDict = doc.context.obj({
    OCGs: ocgsArr,
    D: doc.context.obj({
      Order: ocgsArr,
      ON: ocgsArr,
      OFF: [],
    }),
  });
  doc.catalog.set(PDFName.of("OCProperties"), ocgDict);

  // Wire the marker→OCG mapping into the page's /Resources /Properties.
  const propsDict = doc.context.obj(properties);
  const resources = page.node.Resources();
  if (resources) {
    resources.set(PDFName.of("Properties"), propsDict);
  } else {
    page.node.set(
      PDFName.of("Resources"),
      doc.context.obj({ Properties: propsDict }),
    );
  }
  return out;
}

function beginOc(page: PDFPage, propName: PDFName): void {
  // `/OC /<propName> BDC` — open a marked-content sequence tagged OC.
  page.pushOperators(
    PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
      PDFName.of("OC"),
      propName,
    ]),
  );
}

function endOc(page: PDFPage): void {
  page.pushOperators(
    PDFOperator.of(PDFOperatorNames.EndMarkedContent, []),
  );
}

function drawLineEntity(
  page: PDFPage,
  e: LineEntity,
  drawing: Drawing,
  scale: number,
): void {
  page.drawLine({
    start: { x: e.a[0], y: e.a[1] },
    end: { x: e.b[0], y: e.b[1] },
    thickness: strokeWidthForEntity(e, drawing, scale),
    color: pdfColor(effectiveColor(e, drawing)),
  });
}

function drawCircleEntity(
  page: PDFPage,
  e: CircleEntity,
  drawing: Drawing,
  scale: number,
): void {
  page.drawCircle({
    x: e.c[0],
    y: e.c[1],
    size: e.r,
    borderWidth: strokeWidthForEntity(e, drawing, scale),
    borderColor: pdfColor(effectiveColor(e, drawing)),
  });
}

function drawPointEntity(
  page: PDFPage,
  e: PointEntity,
  drawing: Drawing,
  scale: number,
): void {
  // Render as a tiny filled circle so the point is visible.
  const color = pdfColor(effectiveColor(e, drawing));
  page.drawCircle({
    x: e.p[0],
    y: e.p[1],
    size: 0.5 / scale,
    color,
    borderColor: color,
    borderWidth: 0,
  });
}

function drawSvgEntity(
  page: PDFPage,
  e: ArcEntity | PolylineEntity | EllipseEntity,
  drawing: Drawing,
  scale: number,
  path: string,
): void {
  page.drawSvgPath(path, {
    x: 0,
    y: 0,
    borderWidth: strokeWidthForEntity(e, drawing, scale),
    borderColor: pdfColor(effectiveColor(e, drawing)),
  });
}

function drawTextEntity(
  page: PDFPage,
  e: TextEntity,
  drawing: Drawing,
  font: PDFFont,
  scale: number,
): void {
  // pdf-lib does not natively rotate drawText; for v1 we ignore rotation
  // and align — the value, anchor, and height are the load-bearing bits.
  const lineweight = strokeWidthForEntity(e, drawing, scale);
  void lineweight;
  page.drawText(e.value, {
    x: e.anchor[0],
    y: e.anchor[1],
    size: e.height,
    font,
    color: pdfColor(effectiveColor(e, drawing)),
  });
}

/**
 * Emit a PDF document containing the drawing. Layers become Optional
 * Content Groups so a downstream viewer can toggle visibility.
 */
export async function writePdf(
  drawing: Drawing,
  opts: PdfWriteOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const paper = resolvePaper(opts);
  const page = doc.addPage([paper[0], paper[1]]);

  const ocg = registerOcgs(doc, page, drawing);

  const { scale, tx, ty } = fitTransform(drawing, paper);

  // Apply the fit transform once for the whole content stream:
  // q (scale 0 0 scale tx ty cm) … entities … Q
  page.pushOperators(
    PDFOperator.of(PDFOperatorNames.PushGraphicsState, []),
    PDFOperator.of(PDFOperatorNames.ConcatTransformationMatrix, [
      // pdf-lib expects PDFNumber objects; the high-level helpers below
      // do this for us, but for raw operators we use the doc context.
      doc.context.obj(scale),
      doc.context.obj(0),
      doc.context.obj(0),
      doc.context.obj(scale),
      doc.context.obj(tx),
      doc.context.obj(ty),
    ]),
  );

  for (const layerId of drawing.layerOrder) {
    const layer = drawing.layers.find((l) => l.id === layerId);
    if (!layer) continue;
    const entry = ocg.get(layer.id);
    if (entry) beginOc(page, entry.propName);
    for (const id of drawing.entityOrder) {
      const e = drawing.entities[id];
      if (!e || e.layerId !== layer.id) continue;
      if (isHidden(e, drawing)) continue;
      drawEntity(page, e, drawing, helvetica, scale);
    }
    if (entry) endOc(page);
  }

  page.pushOperators(
    PDFOperator.of(PDFOperatorNames.PopGraphicsState, []),
  );

  // Disable object-stream compression so the catalog dictionary
  // (including /OCProperties) is plain-text searchable by tools that
  // don't decompress streams. Content streams remain uncompressed by
  // default in pdf-lib.
  return doc.save({ useObjectStreams: false });
}

function drawEntity(
  page: PDFPage,
  e: Entity,
  drawing: Drawing,
  font: PDFFont,
  scale: number,
): void {
  switch (e.kind) {
    case "line":
      drawLineEntity(page, e, drawing, scale);
      return;
    case "circle":
      drawCircleEntity(page, e, drawing, scale);
      return;
    case "arc":
      drawSvgEntity(page, e, drawing, scale, svgArcPath(e));
      return;
    case "point":
      drawPointEntity(page, e, drawing, scale);
      return;
    case "polyline":
      drawSvgEntity(page, e, drawing, scale, svgPolylinePath(e));
      return;
    case "ellipse": {
      const isFull =
        Math.abs(e.startParam) < 1e-9 &&
        Math.abs(e.endParam - Math.PI * 2) < 1e-9;
      if (isFull) {
        const major = Math.hypot(e.major[0], e.major[1]);
        const minor = major * e.ratio;
        page.drawEllipse({
          x: e.c[0],
          y: e.c[1],
          xScale: major,
          yScale: minor,
          borderWidth: strokeWidthForEntity(e, drawing, scale),
          borderColor: pdfColor(effectiveColor(e, drawing)),
        });
      } else {
        drawSvgEntity(page, e, drawing, scale, svgPartialEllipsePath(e));
      }
      return;
    }
    case "text":
      drawTextEntity(page, e, drawing, font, scale);
      return;
    case "dimension":
      // Dimensions resolve through their references at render time; PDF
      // export drops a no-op for now (the raster fallback hook lands here
      // once a dimension graph layouter exists).
      return;
  }
}
