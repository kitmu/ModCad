// Dimension dependency graph — FR-014.
//
// Maintains a `Map<entityId, Set<dimensionId>>` so a single entity
// mutation can re-evaluate ONLY the dimensions that reference it
// (O(bound) not O(all entities)). The command bus owns one instance
// per drawing and updates it on entity-add / entity-remove and on
// dimension create/edit/delete.
//
// We also keep the reverse adjacency `Map<dimensionId, Set<entityId>>`
// so `removeEntity` can scrub each touched dimension out cheaply
// without scanning all entries. Pure data structure — no immer, no
// snapshots; it sits next to the bus and is rebuilt on load.
import type { Id } from "../ids.js";

export class DimensionGraph {
  private readonly byEntity = new Map<Id, Set<Id>>();
  private readonly byDimension = new Map<Id, Set<Id>>();

  bind(entityId: Id, dimensionId: Id): void {
    let dims = this.byEntity.get(entityId);
    if (!dims) {
      dims = new Set();
      this.byEntity.set(entityId, dims);
    }
    dims.add(dimensionId);

    let ents = this.byDimension.get(dimensionId);
    if (!ents) {
      ents = new Set();
      this.byDimension.set(dimensionId, ents);
    }
    ents.add(entityId);
  }

  unbind(entityId: Id, dimensionId: Id): void {
    const dims = this.byEntity.get(entityId);
    if (dims) {
      dims.delete(dimensionId);
      if (dims.size === 0) this.byEntity.delete(entityId);
    }
    const ents = this.byDimension.get(dimensionId);
    if (ents) {
      ents.delete(entityId);
      if (ents.size === 0) this.byDimension.delete(dimensionId);
    }
  }

  removeEntity(entityId: Id): readonly Id[] {
    const dims = this.byEntity.get(entityId);
    if (!dims) return [];
    const touched: Id[] = [...dims];
    for (const d of touched) {
      const ents = this.byDimension.get(d);
      if (ents) {
        ents.delete(entityId);
        if (ents.size === 0) this.byDimension.delete(d);
      }
    }
    this.byEntity.delete(entityId);
    return touched;
  }

  dimensionsForEntity(entityId: Id): readonly Id[] {
    const dims = this.byEntity.get(entityId);
    return dims ? [...dims] : [];
  }
}
