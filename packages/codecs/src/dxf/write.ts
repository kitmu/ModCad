// DXF R2018 writer for the supported subset.
// LINE, LWPOLYLINE, POLYLINE legacy 2D, CIRCLE, ARC, ELLIPSE, POINT, TEXT,
// MTEXT, DIMENSION, LAYER, LTYPE.
//
// We always emit LWPOLYLINE for our polyline entity (the modern form),
// never the legacy POLYLINE / VERTEX / SEQEND triplet — but the reader
// accepts the legacy form so DXFs produced elsewhere still round-trip.
import type {
  ArcEntity,
  CircleEntity,
  DimensionEntity,
  Drawing,
  EllipseEntity,
  Entity,
  EntityPointRef,
  Layer,
  LineEntity,
  PointEntity,
  PolylineEntity,
  RGBA,
  TextEntity,
  Vec2Type,
} from "@modcad/core";

function rgbaToAci(c: RGBA): number {
  if (c.r === 1 && c.g === 0 && c.b === 0) return 1;
  if (c.r === 1 && c.g === 1 && c.b === 0) return 2;
  if (c.r === 0 && c.g === 1 && c.b === 0) return 3;
  if (c.r === 0 && c.g === 1 && c.b === 1) return 4;
  if (c.r === 0 && c.g === 0 && c.b === 1) return 5;
  if (c.r === 1 && c.g === 0 && c.b === 1) return 6;
  return 7;
}

class DxfBuilder {
  private readonly out: string[] = [];
  group(code: number, value: string | number): void {
    this.out.push(String(code));
    this.out.push(typeof value === "number" ? formatNum(value) : value);
  }
  toString(): string {
    return this.out.join("\n") + "\n";
  }
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toFixed(1);
  return n.toString();
}

function writeHeader(b: DxfBuilder): void {
  b.group(0, "SECTION");
  b.group(2, "HEADER");
  b.group(9, "$ACADVER");
  b.group(1, "AC1032");
  b.group(9, "$INSUNITS");
  b.group(70, 4);
  b.group(0, "ENDSEC");
}

function writeLtypeTable(b: DxfBuilder): void {
  b.group(0, "TABLE");
  b.group(2, "LTYPE");
  b.group(70, 1);
  b.group(0, "LTYPE");
  b.group(2, "CONTINUOUS");
  b.group(70, 0);
  b.group(3, "Solid line");
  b.group(72, 65);
  b.group(73, 0);
  b.group(40, 0.0);
  b.group(0, "ENDTAB");
}

function writeLayerTable(b: DxfBuilder, layers: Layer[]): void {
  b.group(0, "TABLE");
  b.group(2, "LAYER");
  b.group(70, layers.length);
  for (const l of layers) {
    b.group(0, "LAYER");
    b.group(2, l.name);
    let flags = 0;
    if (l.frozen) flags |= 1;
    if (l.locked) flags |= 4;
    b.group(70, flags);
    const aci = rgbaToAci(l.color);
    b.group(62, l.visible ? aci : -aci);
    b.group(6, "CONTINUOUS");
    b.group(370, Math.round(l.lineweight * 100));
  }
  b.group(0, "ENDTAB");
}

function writeTables(b: DxfBuilder, drawing: Drawing): void {
  b.group(0, "SECTION");
  b.group(2, "TABLES");
  writeLtypeTable(b);
  writeLayerTable(b, drawing.layers);
  b.group(0, "ENDSEC");
}

function layerNameFor(drawing: Drawing, e: Entity): string {
  const layer = drawing.layers.find((l) => l.id === e.layerId);
  return layer?.name ?? "0";
}

function writeLine(b: DxfBuilder, drawing: Drawing, e: LineEntity): void {
  b.group(0, "LINE");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.a[0]); b.group(20, e.a[1]); b.group(30, 0);
  b.group(11, e.b[0]); b.group(21, e.b[1]); b.group(31, 0);
}

function writeCircle(b: DxfBuilder, drawing: Drawing, e: CircleEntity): void {
  b.group(0, "CIRCLE");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.c[0]); b.group(20, e.c[1]); b.group(30, 0);
  b.group(40, e.r);
}

function writeArc(b: DxfBuilder, drawing: Drawing, e: ArcEntity): void {
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  b.group(0, "ARC");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.c[0]); b.group(20, e.c[1]); b.group(30, 0);
  b.group(40, e.r);
  b.group(50, toDeg(e.startAngle));
  b.group(51, toDeg(e.endAngle));
}

function writePoint(b: DxfBuilder, drawing: Drawing, e: PointEntity): void {
  b.group(0, "POINT");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.p[0]); b.group(20, e.p[1]); b.group(30, 0);
}

function writeLwPolyline(b: DxfBuilder, drawing: Drawing, e: PolylineEntity): void {
  b.group(0, "LWPOLYLINE");
  b.group(8, layerNameFor(drawing, e));
  b.group(90, e.vertices.length);
  b.group(70, e.closed ? 1 : 0);
  for (const v of e.vertices) {
    b.group(10, v.p[0]);
    b.group(20, v.p[1]);
    if (v.bulge !== 0) b.group(42, v.bulge);
  }
}

function writeEllipse(b: DxfBuilder, drawing: Drawing, e: EllipseEntity): void {
  b.group(0, "ELLIPSE");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.c[0]); b.group(20, e.c[1]); b.group(30, 0);
  b.group(11, e.major[0]); b.group(21, e.major[1]); b.group(31, 0);
  b.group(40, e.ratio);
  b.group(41, e.startParam);
  b.group(42, e.endParam);
}

const ALIGN_HALIGN: Record<TextEntity["align"], number> = {
  tl: 0, tc: 1, tr: 2,
  ml: 0, mc: 1, mr: 2,
  bl: 0, bc: 1, br: 2,
};
const ALIGN_VALIGN: Record<TextEntity["align"], number> = {
  tl: 3, tc: 3, tr: 3,
  ml: 2, mc: 2, mr: 2,
  bl: 1, bc: 1, br: 1,
};
const ALIGN_MTEXT_ATTACH: Record<TextEntity["align"], number> = {
  tl: 1, tc: 2, tr: 3,
  ml: 4, mc: 5, mr: 6,
  bl: 7, bc: 8, br: 9,
};

function writeText(b: DxfBuilder, drawing: Drawing, e: TextEntity): void {
  // We emit MTEXT for any text that contains a newline so multi-line
  // content survives the round-trip; otherwise plain TEXT.
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const hasNewline = e.value.includes("\n");
  if (!hasNewline) {
    b.group(0, "TEXT");
    b.group(8, layerNameFor(drawing, e));
    b.group(10, e.anchor[0]); b.group(20, e.anchor[1]); b.group(30, 0);
    b.group(40, e.height);
    b.group(1, e.value);
    b.group(50, toDeg(e.rotation));
    b.group(7, e.styleId || "STANDARD");
    b.group(72, ALIGN_HALIGN[e.align]);
    b.group(73, ALIGN_VALIGN[e.align]);
    return;
  }
  b.group(0, "MTEXT");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.anchor[0]); b.group(20, e.anchor[1]); b.group(30, 0);
  b.group(40, e.height);
  b.group(7, e.styleId || "STANDARD");
  b.group(71, ALIGN_MTEXT_ATTACH[e.align]);
  // Convert newlines to the MTEXT \P paragraph break.
  b.group(1, e.value.replace(/\n/g, "\\P"));
  b.group(50, toDeg(e.rotation));
}

function refToPoint(refs: EntityPointRef | Vec2Type): Vec2Type {
  // Vec2 is a readonly [number, number] tuple; EntityPointRef is an object.
  // The Array.isArray narrow needs a tuple assertion to satisfy strict mode.
  if (Array.isArray(refs)) return refs as Vec2Type;
  // EntityPointRef has no resolved coordinate without a Drawing scan;
  // emit [0,0] as a placeholder. The dimension graph carries the live
  // value at runtime; on round-trip the reader will recreate it as a
  // Vec2 (with an unresolved-dimension-ref warning).
  return [0, 0];
}

function writeDimension(b: DxfBuilder, drawing: Drawing, e: DimensionEntity): void {
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  b.group(0, "DIMENSION");
  b.group(8, layerNameFor(drawing, e));

  let variantBits = 0;
  switch (e.variant) {
    case "linear": variantBits = 0; break;
    case "aligned": variantBits = 1; break;
    case "angular": variantBits = 2; break;
    case "diameter": variantBits = 3; break;
    case "radial": variantBits = 4; break;
  }

  // Dimension line definition point (group 10/20).
  // For variants with two extension points we use their midpoint.
  let defPt: Vec2Type = [0, 0];
  if (e.refs.variant === "linear" || e.refs.variant === "aligned") {
    const a = refToPoint(e.refs.a);
    const b2 = refToPoint(e.refs.b);
    defPt = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2 + e.offset];
  } else if (e.refs.variant === "angular") {
    defPt = e.refs.v;
  }
  b.group(10, defPt[0]); b.group(20, defPt[1]); b.group(30, 0);

  // Text mid point (group 11/21) — reuse defPt.
  b.group(11, defPt[0]); b.group(21, defPt[1]); b.group(31, 0);

  b.group(70, variantBits);
  b.group(3, e.styleId || "STANDARD");

  if (e.refs.variant === "linear" || e.refs.variant === "aligned") {
    const a = refToPoint(e.refs.a);
    const b2 = refToPoint(e.refs.b);
    b.group(13, a[0]); b.group(23, a[1]); b.group(33, 0);
    b.group(14, b2[0]); b.group(24, b2[1]); b.group(34, 0);
    if (e.refs.variant === "linear") {
      b.group(50, e.refs.axis === "y" ? 90 : 0);
    }
  } else if (e.refs.variant === "angular") {
    const a = refToPoint(e.refs.a);
    const b2 = refToPoint(e.refs.b);
    b.group(13, a[0]); b.group(23, a[1]); b.group(33, 0);
    b.group(14, b2[0]); b.group(24, b2[1]); b.group(34, 0);
    b.group(15, e.refs.v[0]); b.group(25, e.refs.v[1]); b.group(35, 0);
    void toDeg;
  } else if (e.refs.variant === "radial" || e.refs.variant === "diameter") {
    // Without a resolved circle/arc reference, drop the chord point at 0,0.
    b.group(15, 0); b.group(25, 0); b.group(35, 0);
  }
}

function writeEntities(b: DxfBuilder, drawing: Drawing): void {
  b.group(0, "SECTION");
  b.group(2, "ENTITIES");
  for (const id of drawing.entityOrder) {
    const e = drawing.entities[id];
    if (!e) continue;
    switch (e.kind) {
      case "line": writeLine(b, drawing, e); break;
      case "circle": writeCircle(b, drawing, e); break;
      case "arc": writeArc(b, drawing, e); break;
      case "point": writePoint(b, drawing, e); break;
      case "polyline": writeLwPolyline(b, drawing, e); break;
      case "ellipse": writeEllipse(b, drawing, e); break;
      case "text": writeText(b, drawing, e); break;
      case "dimension": writeDimension(b, drawing, e); break;
    }
  }
  b.group(0, "ENDSEC");
}

/** Serialize a Drawing as DXF R2018 ASCII text. */
export function writeDxf(drawing: Drawing): string {
  const b = new DxfBuilder();
  writeHeader(b);
  writeTables(b, drawing);
  writeEntities(b, drawing);
  b.group(0, "EOF");
  return b.toString();
}
