// Tile-based composite cache for far-zoom-out (T116).
//
// At very low zoom (<= ~1 px per world unit, configurable per camera
// bucket), re-tessellating every line on every frame is wasteful. Each
// tile covers a fixed area in world space at a given zoom bucket; once
// rendered, the tile is keyed by `<zoomBucket, tileX, tileY>` and
// reused until a write into that area marks it dirty.
//
// This module is *backend-agnostic*: it owns no GPU resources. It only
// answers questions like "give me the tile keys that cover this
// viewport at this zoom" and "which tiles does this entity touch?" The
// backend uses those keys to manage a real texture cache; tests cover
// the bookkeeping without a GPU.
//
// Activation is opt-in via `SceneRenderer.setTileCacheEnabled(true)`
// (see api.ts). Default is off so existing parity tests don't shift.
import type { Id } from "@modcad/core";
import type { BboxType } from "@modcad/core";

export interface TileKey {
  /** Discretized zoom level — see {@link bucketForZoom}. */
  zoomBucket: number;
  /** Tile-X in tile-space (`floor(worldX / tileSize)`). */
  x: number;
  /** Tile-Y in tile-space. */
  y: number;
}

export interface TileCacheConfig {
  /** Tile size in world units at zoomBucket=1. Default 256. */
  tileSizeWorld: number;
  /**
   * Approximate texture memory cap, bytes. Eviction is LRU; the
   * caller supplies per-tile cost via {@link TileCache.insert}.
   * Default 32 MiB to keep the cache in a single texture atlas
   * worth of VRAM on modest GPUs.
   */
  maxBytes: number;
  /** Zooms below this threshold opt into tile compositing. */
  zoomActivationThreshold: number;
}

export const DEFAULT_TILE_CONFIG: TileCacheConfig = {
  tileSizeWorld: 256,
  maxBytes: 32 * 1024 * 1024,
  zoomActivationThreshold: 0.5,
};

/**
 * Map a continuous camera zoom into a small set of discrete buckets so
 * tiles can be cached across pan without invalidating on every zoom
 * tick. Buckets are powers of two so neighbouring buckets always share
 * a clean 2× relationship.
 */
export function bucketForZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 0;
  // floor(log2(1/zoom)) — zoom < 1 ⇒ bucket >= 0; zoom == 1 ⇒ 0;
  // zoom > 1 ⇒ negative bucket (close-in detail). Tiles at negative
  // buckets are typically not cached; the caller decides.
  return Math.floor(Math.log2(1 / zoom));
}

/**
 * Should the tile cache activate at this zoom? Returns false at high
 * zoom levels where per-frame tessellation is already cheap.
 */
export function shouldActivateTiles(
  zoom: number,
  cfg: TileCacheConfig = DEFAULT_TILE_CONFIG,
): boolean {
  return zoom <= cfg.zoomActivationThreshold;
}

/**
 * Enumerate the tile keys covering an axis-aligned viewport at a given
 * zoom. World→tile is `floor((worldCoord) / tileWorldSize)` where the
 * tile world size scales with the zoom bucket: each bucket step
 * doubles the world area a single tile covers.
 */
export function tilesForViewport(
  viewport: BboxType,
  zoom: number,
  cfg: TileCacheConfig = DEFAULT_TILE_CONFIG,
): TileKey[] {
  const zoomBucket = bucketForZoom(zoom);
  const sizeWorld = cfg.tileSizeWorld * Math.pow(2, Math.max(0, zoomBucket));
  const minTx = Math.floor(viewport.minX / sizeWorld);
  const maxTx = Math.floor(viewport.maxX / sizeWorld);
  const minTy = Math.floor(viewport.minY / sizeWorld);
  const maxTy = Math.floor(viewport.maxY / sizeWorld);
  const out: TileKey[] = [];
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      out.push({ zoomBucket, x: tx, y: ty });
    }
  }
  return out;
}

/** Tile keys an entity bbox writes into, across all cached buckets. */
export function tilesForBbox(
  bbox: BboxType,
  buckets: readonly number[],
  cfg: TileCacheConfig = DEFAULT_TILE_CONFIG,
): TileKey[] {
  const out: TileKey[] = [];
  for (const zoomBucket of buckets) {
    const sizeWorld = cfg.tileSizeWorld * Math.pow(2, Math.max(0, zoomBucket));
    const minTx = Math.floor(bbox.minX / sizeWorld);
    const maxTx = Math.floor(bbox.maxX / sizeWorld);
    const minTy = Math.floor(bbox.minY / sizeWorld);
    const maxTy = Math.floor(bbox.maxY / sizeWorld);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        out.push({ zoomBucket, x: tx, y: ty });
      }
    }
  }
  return out;
}

export function tileKeyString(k: TileKey): string {
  return `${k.zoomBucket}:${k.x}:${k.y}`;
}

interface TileEntry {
  key: TileKey;
  bytes: number;
  // Caller-supplied opaque value — usually a GPU texture handle.
  payload: unknown;
}

/**
 * Bounded LRU tile cache. Backend-agnostic: payload is opaque (a
 * texture handle in the real renderer, anything in tests). Eviction
 * happens when `bytesInUse > config.maxBytes` after an insert.
 *
 * Dirty invalidation is keyed by tile string so a single
 * `invalidateBbox` call drops every overlapping tile across all
 * active buckets.
 */
export class TileCache {
  private readonly cfg: TileCacheConfig;
  // Map preserves insertion order; we delete + re-set on `touch()` so
  // the front of iteration is the LRU candidate.
  private readonly entries = new Map<string, TileEntry>();
  private bytesInUse = 0;
  private readonly activeBuckets = new Set<number>();
  private evictionListener: ((key: TileKey, payload: unknown) => void) | null =
    null;

  constructor(cfg: Partial<TileCacheConfig> = {}) {
    this.cfg = { ...DEFAULT_TILE_CONFIG, ...cfg };
  }

  get config(): TileCacheConfig {
    return this.cfg;
  }

  get size(): number {
    return this.entries.size;
  }

  get usedBytes(): number {
    return this.bytesInUse;
  }

  /** All bucket levels currently represented. Used by invalidation. */
  buckets(): readonly number[] {
    return [...this.activeBuckets];
  }

  /**
   * Insert or replace a tile. Bytes count toward the LRU budget; the
   * payload is opaque to the cache. If the insert pushes us over the
   * memory cap, we evict from the front of insertion order.
   */
  insert(key: TileKey, payload: unknown, bytes: number): void {
    const s = tileKeyString(key);
    const existing = this.entries.get(s);
    if (existing) {
      this.bytesInUse -= existing.bytes;
      this.entries.delete(s);
    }
    const entry: TileEntry = { key, bytes, payload };
    this.entries.set(s, entry);
    this.bytesInUse += bytes;
    this.activeBuckets.add(key.zoomBucket);
    this.evictIfNeeded();
  }

  /** Mark a tile as recently used (move to MRU end). */
  touch(key: TileKey): void {
    const s = tileKeyString(key);
    const e = this.entries.get(s);
    if (!e) return;
    this.entries.delete(s);
    this.entries.set(s, e);
  }

  get(key: TileKey): unknown | undefined {
    const s = tileKeyString(key);
    const e = this.entries.get(s);
    if (!e) return undefined;
    this.touch(key);
    return e.payload;
  }

  has(key: TileKey): boolean {
    return this.entries.has(tileKeyString(key));
  }

  /**
   * Drop every tile that overlaps `bbox` at any active zoom bucket.
   * The backend should drop the corresponding GPU texture in its
   * eviction listener.
   */
  invalidateBbox(bbox: BboxType): TileKey[] {
    const dropped: TileKey[] = [];
    for (const k of tilesForBbox(bbox, [...this.activeBuckets], this.cfg)) {
      const s = tileKeyString(k);
      const e = this.entries.get(s);
      if (e) {
        this.bytesInUse -= e.bytes;
        this.entries.delete(s);
        this.evictionListener?.(e.key, e.payload);
        dropped.push(e.key);
      }
    }
    return dropped;
  }

  /** Drop everything. Backend's eviction listener fires per tile. */
  clear(): void {
    for (const e of this.entries.values()) {
      this.evictionListener?.(e.key, e.payload);
    }
    this.entries.clear();
    this.bytesInUse = 0;
    this.activeBuckets.clear();
  }

  /**
   * Register a callback invoked whenever the cache discards a tile,
   * whether via {@link invalidateBbox}, LRU eviction, or {@link clear}.
   * Callers free GPU textures here.
   */
  onEvict(listener: (key: TileKey, payload: unknown) => void): () => void {
    this.evictionListener = listener;
    return () => {
      if (this.evictionListener === listener) this.evictionListener = null;
    };
  }

  private evictIfNeeded(): void {
    while (this.bytesInUse > this.cfg.maxBytes && this.entries.size > 1) {
      // Map iteration is insertion-ordered; `next()` gives the LRU.
      const firstKey = this.entries.keys().next().value;
      if (firstKey === undefined) return;
      const e = this.entries.get(firstKey);
      if (!e) return;
      this.entries.delete(firstKey);
      this.bytesInUse -= e.bytes;
      this.evictionListener?.(e.key, e.payload);
    }
  }
}

/**
 * Tracker the renderer feeds with entity bbox writes/removes between
 * frames. At frame-start the renderer calls {@link flush} and uses the
 * returned tile-set to evict from the {@link TileCache}, then the
 * tracker resets. Keeping this off the cache itself lets the renderer
 * coalesce many upserts into one invalidation pass.
 */
export class TileInvalidationTracker {
  private readonly dirtyByEntity = new Map<Id, BboxType>();

  noteUpsert(id: Id, bbox: BboxType): void {
    // If the entity already has a pending bbox, union them — we need
    // to invalidate both the old and new footprints.
    const prev = this.dirtyByEntity.get(id);
    if (prev) {
      this.dirtyByEntity.set(id, unionBbox(prev, bbox));
    } else {
      this.dirtyByEntity.set(id, bbox);
    }
  }

  noteRemove(id: Id, bbox: BboxType): void {
    const prev = this.dirtyByEntity.get(id);
    this.dirtyByEntity.set(id, prev ? unionBbox(prev, bbox) : bbox);
  }

  /** Pending invalidations. Caller should clear after consuming. */
  pending(): BboxType[] {
    return [...this.dirtyByEntity.values()];
  }

  reset(): void {
    this.dirtyByEntity.clear();
  }

  get pendingCount(): number {
    return this.dirtyByEntity.size;
  }
}

function unionBbox(a: BboxType, b: BboxType): BboxType {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
