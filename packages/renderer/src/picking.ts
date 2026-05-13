// Picking: maps a 32-bit hash → entity Id. Each backend draws into a
// separate render target whose RGBA encodes the hash; on `pick()` it
// reads back one pixel and resolves to the full Id via this map.
//
// CPU fallback: AABB-test every entity. Used when:
//   * the backend is too old to support fast readback
//   * the test environment lacks GPU access
import type { Entity, Id } from "@modcad/core";

/**
 * FNV-1a 32-bit. Deterministic, cheap, and good enough for picking — a
 * collision means the wrong (but plausible) entity is selected, which
 * is recoverable on the next frame because the map is rebuilt every
 * upsert.
 */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Avoid 0 — that's the "no entity" sentinel.
  return h === 0 ? 1 : h;
}

export class PickIndex {
  private readonly byHash = new Map<number, Id>();

  reset(): void {
    this.byHash.clear();
  }

  register(id: Id): number {
    const h = hashId(id);
    this.byHash.set(h, id);
    return h;
  }

  resolve(hash: number): Id | null {
    return this.byHash.get(hash) ?? null;
  }

  /** Decode an RGBA8 pixel (little-endian, R is low byte) into a hash. */
  static decodePixel(pixel: Uint8Array | Uint8ClampedArray): number {
    const r = pixel[0] ?? 0;
    const g = pixel[1] ?? 0;
    const b = pixel[2] ?? 0;
    const a = pixel[3] ?? 0;
    return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
  }

  /** Encode a hash to four 8-bit components. */
  static encodeHash(hash: number): [number, number, number, number] {
    return [
      hash & 0xff,
      (hash >>> 8) & 0xff,
      (hash >>> 16) & 0xff,
      (hash >>> 24) & 0xff,
    ];
  }
}

/**
 * Brute-force CPU pick: returns the topmost entity whose AABB contains
 * the world-space query point. Render order is the iteration order of
 * `entities` — caller is expected to pass them in scene order.
 */
export function cpuPick(
  entities: readonly Entity[],
  worldX: number,
  worldY: number,
  tolerance: number,
): Id | null {
  // Iterate in reverse so the topmost (last-drawn) entity wins.
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    if (!e) continue;
    if (entityHits(e, worldX, worldY, tolerance)) return e.id;
  }
  return null;
}

function entityHits(
  e: Entity,
  x: number,
  y: number,
  tol: number,
): boolean {
  switch (e.kind) {
    case "line": {
      const dx = e.b[0] - e.a[0];
      const dy = e.b[1] - e.a[1];
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) return Math.hypot(x - e.a[0], y - e.a[1]) <= tol;
      const t = Math.max(
        0,
        Math.min(1, ((x - e.a[0]) * dx + (y - e.a[1]) * dy) / len2),
      );
      const px = e.a[0] + t * dx;
      const py = e.a[1] + t * dy;
      return Math.hypot(x - px, y - py) <= tol;
    }
    case "circle":
      return Math.abs(Math.hypot(x - e.c[0], y - e.c[1]) - e.r) <= tol;
    case "arc": {
      const d = Math.abs(Math.hypot(x - e.c[0], y - e.c[1]) - e.r);
      return d <= tol;
    }
    case "point":
      return Math.hypot(x - e.p[0], y - e.p[1]) <= tol;
    default:
      // Polyline/ellipse/text/dimension: simple bbox-ish miss for now;
      // GPU pick is authoritative — this is only a coarse fallback.
      return false;
  }
}
