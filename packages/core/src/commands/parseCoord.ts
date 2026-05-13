// Numeric coordinate parser — FR-002 ("typed numeric input") and
// FR-002a ("dynamic input box accepts absolute, relative, and polar
// forms").
//
// Grammar:
//   absolute   ::= number "," number             // world coords
//   relative   ::= "@" number "," number         // dx,dy from lastPoint
//   polar      ::= "@" number "<" number         // dist<angle from lastPoint
//
// `angle` is in the unit named by `ctx.angleUnit`. v1 ships degrees;
// radians is exposed so tests and configurable units (research.md
// "Angle precision configurable") can exercise the other branch.
//
// Whitespace around any token is tolerated. Numbers accept a leading
// sign and standard JS float syntax (1, -1, 1.5, .5, 1e3, 1.5e-2).
// Hexadecimal / Infinity / NaN are rejected so malformed input always
// surfaces as a clean parse error rather than a surprise number.
import type { Vec2 } from "../geometry/Vec2.js";

export interface ParseContext {
  /** Most-recent committed point — used as the reference for @rel / @polar. */
  lastPoint: Vec2 | null;
  /** Angle unit. v1 ships degrees; the spec leaves precision configurable. */
  angleUnit: "deg" | "rad";
}

export type ParseResult =
  | { ok: true; point: Vec2 }
  | { ok: false; error: string };

// Accept what `Number(...)` accepts EXCEPT the empty string, "Infinity",
// hex/octal/binary, and bare leading/trailing letters. We re-validate
// with a regex so "1foo" doesn't sneak through as NaN-> error and so
// "" doesn't become 0.
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseNumber(raw: string): number | null {
  const s = raw.trim();
  if (!NUMBER_RE.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function err(msg: string): ParseResult {
  return { ok: false, error: msg };
}

export function parseCoord(input: string, ctx: ParseContext): ParseResult {
  const s = input.trim();
  if (s === "") return err("empty input");

  // Relative or polar — both start with '@'.
  if (s.startsWith("@")) {
    const body = s.slice(1).trim();
    if (body === "") return err("'@' must be followed by dx,dy or dist<angle");
    if (ctx.lastPoint === null) {
      return err("relative coordinate requires a previous point");
    }
    if (body.includes("<")) {
      const parts = body.split("<");
      if (parts.length !== 2) {
        return err(`polar form expects 'dist<angle', got '${input}'`);
      }
      const dist = parseNumber(parts[0]!);
      const angle = parseNumber(parts[1]!);
      if (dist === null) return err(`invalid distance in polar form: '${parts[0]}'`);
      if (angle === null) return err(`invalid angle in polar form: '${parts[1]}'`);
      const rad = ctx.angleUnit === "deg" ? (angle * Math.PI) / 180 : angle;
      const [lx, ly] = ctx.lastPoint;
      return { ok: true, point: [lx + dist * Math.cos(rad), ly + dist * Math.sin(rad)] };
    }
    // Relative dx,dy
    const parts = body.split(",");
    if (parts.length !== 2) {
      return err(`relative form expects '@dx,dy' or '@dist<angle', got '${input}'`);
    }
    const dx = parseNumber(parts[0]!);
    const dy = parseNumber(parts[1]!);
    if (dx === null) return err(`invalid dx in relative form: '${parts[0]}'`);
    if (dy === null) return err(`invalid dy in relative form: '${parts[1]}'`);
    const [lx, ly] = ctx.lastPoint;
    return { ok: true, point: [lx + dx, ly + dy] };
  }

  // Absolute x,y
  const parts = s.split(",");
  if (parts.length !== 2) {
    return err(`absolute form expects 'x,y', got '${input}'`);
  }
  const x = parseNumber(parts[0]!);
  const y = parseNumber(parts[1]!);
  if (x === null) return err(`invalid x: '${parts[0]}'`);
  if (y === null) return err(`invalid y: '${parts[1]}'`);
  return { ok: true, point: [x, y] };
}
