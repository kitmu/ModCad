// Two-tier spatial index facade (research.md "Spatial index").
//
// Tier 1 — `SpatialIndex` (flatbush): static, immutable, rebuilt after
// each command commit. Used for view culling and box-select against the
// bulk of the scene. flatbush packs the whole index into a single
// ArrayBuffer for tight cache lines and is markedly faster than rbush
// on bulk-load + query workloads, at the cost of being non-mutable.
//
// Tier 2 — `DynamicIndex` (rbush): mutable companion that absorbs the
// in-flight churn of a long-running command (rubber-band drag, etc.)
// without requiring a full flatbush rebuild on every cursor frame.
// At commit time the SceneStore folds the dynamic delta back into a
// fresh static index.
import Flatbush from "flatbush";
import RBush from "rbush";
import type { Id } from "../ids.js";
import type { Bbox } from "../geometry/Bbox.js";
import type { Vec2 } from "../geometry/Vec2.js";

export interface SpatialIndex {
  /** Ids whose bbox intersects `box`. Order unspecified. */
  queryBox(box: Bbox): Id[];
  /** Ids whose bbox is within `tolerance` of `p` (square neighborhood). */
  queryPoint(p: Vec2, tolerance: number): Id[];
  readonly size: number;
}

class FlatbushSpatialIndex implements SpatialIndex {
  readonly size: number;
  private readonly idByOffset: readonly Id[];
  private readonly bush: Flatbush | null;

  constructor(entries: ReadonlyArray<{ id: Id; bbox: Bbox }>) {
    this.size = entries.length;
    if (entries.length === 0) {
      this.bush = null;
      this.idByOffset = [];
      return;
    }
    const bush = new Flatbush(entries.length);
    const ids: Id[] = new Array<Id>(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      bush.add(e.bbox.minX, e.bbox.minY, e.bbox.maxX, e.bbox.maxY);
      ids[i] = e.id;
    }
    bush.finish();
    this.bush = bush;
    this.idByOffset = ids;
  }

  queryBox(box: Bbox): Id[] {
    if (this.bush === null) return [];
    const offsets = this.bush.search(box.minX, box.minY, box.maxX, box.maxY);
    return offsets.map((o) => this.idByOffset[o]!);
  }

  queryPoint(p: Vec2, tolerance: number): Id[] {
    if (this.bush === null) return [];
    const offsets = this.bush.search(
      p[0] - tolerance,
      p[1] - tolerance,
      p[0] + tolerance,
      p[1] + tolerance,
    );
    return offsets.map((o) => this.idByOffset[o]!);
  }
}

/**
 * Bulk-build a static spatial index. The returned object is immutable;
 * mutations during a command go to a paired {@link DynamicIndex} and
 * the static index is rebuilt at command-commit time.
 */
export function buildStaticIndex(
  entries: ReadonlyArray<{ id: Id; bbox: Bbox }>,
): SpatialIndex {
  return new FlatbushSpatialIndex(entries);
}

// --- DynamicIndex --------------------------------------------------------

interface RBushEntry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: Id;
}

/**
 * Mutable companion index for in-command edit churn. Backed by rbush
 * because flatbush requires bulk load + finish(); rbush accepts cheap
 * insert/remove which is what we need for rubber-band drags.
 */
export class DynamicIndex {
  private readonly bush: RBush<RBushEntry>;
  private readonly entryById: Map<Id, RBushEntry>;

  constructor() {
    this.bush = new RBush<RBushEntry>();
    this.entryById = new Map();
  }

  get size(): number {
    return this.entryById.size;
  }

  insert(id: Id, bbox: Bbox): void {
    if (this.entryById.has(id)) {
      // Treat repeat insert as update — caller bug, but useful in tests.
      this.update(id, bbox);
      return;
    }
    const entry: RBushEntry = {
      minX: bbox.minX,
      minY: bbox.minY,
      maxX: bbox.maxX,
      maxY: bbox.maxY,
      id,
    };
    this.bush.insert(entry);
    this.entryById.set(id, entry);
  }

  remove(id: Id): void {
    const entry = this.entryById.get(id);
    if (entry === undefined) return;
    // rbush remove by reference (cheap when we hand back the exact object).
    this.bush.remove(entry);
    this.entryById.delete(id);
  }

  update(id: Id, bbox: Bbox): void {
    this.remove(id);
    this.insert(id, bbox);
  }

  queryBox(box: Bbox): Id[] {
    return this.bush
      .search({ minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY })
      .map((e) => e.id);
  }

  queryPoint(p: Vec2, tolerance: number): Id[] {
    return this.bush
      .search({
        minX: p[0] - tolerance,
        minY: p[1] - tolerance,
        maxX: p[0] + tolerance,
        maxY: p[1] + tolerance,
      })
      .map((e) => e.id);
  }
}
