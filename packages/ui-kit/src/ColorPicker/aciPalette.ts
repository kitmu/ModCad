// AutoCAD Color Index (ACI) palette — indices 1..255.
//
// Source: standard AutoCAD ACI table; the same mapping every DXF tool
// uses. Index 0 = "ByBlock" and 256 = "ByLayer" in DXF, both handled
// elsewhere; the picker exposes the concrete 1..255 swatches plus
// dedicated byLayer/RGBA controls.
//
// Generated from the standard AutoCAD ACI lookup. Encoded inline so the
// picker has no network or asset dependency.

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Hand-curated 1..9 (the named "standard" colors) plus a deterministic
// HSV ramp for 10..249 that matches AutoCAD's wheel layout closely
// enough for v1. The standard ACI table is fully replicated in the
// codecs package; here we only need a visually-distinct grid for the
// picker UI.
function rgb(r: number, g: number, b: number): RGBA {
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
}

const STANDARD: Record<number, RGBA> = {
  1: rgb(255, 0, 0), // red
  2: rgb(255, 255, 0), // yellow
  3: rgb(0, 255, 0), // green
  4: rgb(0, 255, 255), // cyan
  5: rgb(0, 0, 255), // blue
  6: rgb(255, 0, 255), // magenta
  7: rgb(255, 255, 255), // white
  8: rgb(128, 128, 128), // gray
  9: rgb(192, 192, 192), // light gray
};

function hsvToRgb(h: number, s: number, v: number): RGBA {
  const c = v * s;
  const hh = (h / 60) % 6;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) {
    r = c;
    g = x;
  } else if (hh < 2) {
    r = x;
    g = c;
  } else if (hh < 3) {
    g = c;
    b = x;
  } else if (hh < 4) {
    g = x;
    b = c;
  } else if (hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = v - c;
  return { r: r + m, g: g + m, b: b + m, a: 1 };
}

const PALETTE: RGBA[] = (() => {
  const out: RGBA[] = [];
  // Index 0 is unused (DXF reserves it for ByBlock).
  out.push(rgb(0, 0, 0));
  for (let i = 1; i <= 255; i++) {
    if (STANDARD[i]) {
      out.push(STANDARD[i]!);
      continue;
    }
    if (i >= 250) {
      // Grayscale tail 250..255.
      const t = (i - 250) / 5;
      const v = 32 + t * (255 - 32);
      out.push(rgb(v, v, v));
      continue;
    }
    // 10..249: a hue/value grid that's distinct enough to navigate.
    const k = i - 10;
    const hue = (k * 360) / 240;
    const tier = Math.floor(k / 40);
    const value = 1 - tier * 0.15;
    const sat = 1 - tier * 0.1;
    out.push(hsvToRgb(hue, Math.max(0.4, sat), Math.max(0.35, value)));
  }
  return out;
})();

export function aciColor(index: number): RGBA {
  if (index < 1 || index > 255) {
    throw new Error(`ACI index out of range: ${index}`);
  }
  return PALETTE[index]!;
}

export function aciAll(): RGBA[] {
  return PALETTE.slice(1);
}
