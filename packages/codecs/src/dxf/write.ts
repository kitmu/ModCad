// Minimal DXF R2018 writer for the supported subset.
// LINE, LWPOLYLINE, CIRCLE, ARC, POINT, LAYER, LTYPE this round.
// TODO(Phase 8): MTEXT, DIMENSION, POLYLINE legacy 2D, ELLIPSE.
import type {
  ArcEntity,
  CircleEntity,
  Drawing,
  Entity,
  Layer,
  LineEntity,
  PointEntity,
  PolylineEntity,
  RGBA,
} from "@modcad/core";

function rgbaToAci(c: RGBA): number {
  // Reverse of the reader's coarse ACI palette. Anything unmapped → 7 (white).
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
  // DXF tolerates "1.0"; produce enough precision for round-trip on doubles
  // without scientific notation surprises.
  if (Number.isInteger(n)) return n.toFixed(1);
  return n.toString();
}

function writeHeader(b: DxfBuilder): void {
  b.group(0, "SECTION");
  b.group(2, "HEADER");
  b.group(9, "$ACADVER");
  b.group(1, "AC1032"); // AutoCAD 2018
  b.group(9, "$INSUNITS");
  b.group(70, 4); // millimeters; reader ignores this for now
  b.group(0, "ENDSEC");
}

function writeLtypeTable(b: DxfBuilder): void {
  b.group(0, "TABLE");
  b.group(2, "LTYPE");
  b.group(70, 1);
  // Minimum required CONTINUOUS linetype.
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
    // DXF lineweight in 1/100mm.
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
  b.group(10, e.a[0]);
  b.group(20, e.a[1]);
  b.group(30, 0);
  b.group(11, e.b[0]);
  b.group(21, e.b[1]);
  b.group(31, 0);
}

function writeCircle(b: DxfBuilder, drawing: Drawing, e: CircleEntity): void {
  b.group(0, "CIRCLE");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.c[0]);
  b.group(20, e.c[1]);
  b.group(30, 0);
  b.group(40, e.r);
}

function writeArc(b: DxfBuilder, drawing: Drawing, e: ArcEntity): void {
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  b.group(0, "ARC");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.c[0]);
  b.group(20, e.c[1]);
  b.group(30, 0);
  b.group(40, e.r);
  b.group(50, toDeg(e.startAngle));
  b.group(51, toDeg(e.endAngle));
}

function writePoint(b: DxfBuilder, drawing: Drawing, e: PointEntity): void {
  b.group(0, "POINT");
  b.group(8, layerNameFor(drawing, e));
  b.group(10, e.p[0]);
  b.group(20, e.p[1]);
  b.group(30, 0);
}

function writeLwPolyline(
  b: DxfBuilder,
  drawing: Drawing,
  e: PolylineEntity,
): void {
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

function writeEntities(b: DxfBuilder, drawing: Drawing): void {
  b.group(0, "SECTION");
  b.group(2, "ENTITIES");
  for (const id of drawing.entityOrder) {
    const e = drawing.entities[id];
    if (!e) continue;
    switch (e.kind) {
      case "line":
        writeLine(b, drawing, e);
        break;
      case "circle":
        writeCircle(b, drawing, e);
        break;
      case "arc":
        writeArc(b, drawing, e);
        break;
      case "point":
        writePoint(b, drawing, e);
        break;
      case "polyline":
        writeLwPolyline(b, drawing, e);
        break;
      // TODO(Phase 8): MTEXT, DIMENSION, POLYLINE legacy 2D, ELLIPSE
      case "ellipse":
      case "text":
      case "dimension":
        break;
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
