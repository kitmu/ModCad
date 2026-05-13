// CPU-side cache of the scene. Both backends keep one to:
//   * repopulate GPU buffers after a context loss (FR-034)
//   * answer CPU-fallback pick queries
//   * provide a deterministic iteration order for parity testing
import type { Entity, Id } from "@modcad/core";

export class SceneState {
  private readonly map = new Map<Id, Entity>();
  private order: Id[] = [];
  private dirty = true;

  upsert(entities: readonly Entity[]): void {
    for (const e of entities) {
      if (!this.map.has(e.id)) this.order.push(e.id);
      this.map.set(e.id, e);
    }
    this.dirty = true;
  }

  remove(ids: readonly Id[]): void {
    let removed = false;
    for (const id of ids) {
      if (this.map.delete(id)) removed = true;
    }
    if (removed) {
      this.order = this.order.filter((id) => this.map.has(id));
      this.dirty = true;
    }
  }

  get size(): number {
    return this.map.size;
  }

  entities(): readonly Entity[] {
    return this.order.map((id) => {
      const e = this.map.get(id);
      if (!e) throw new Error(`scene-state: missing entity ${id}`);
      return e;
    });
  }

  markClean(): void {
    this.dirty = false;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  clear(): void {
    this.map.clear();
    this.order = [];
    this.dirty = true;
  }
}
