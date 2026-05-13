// Transient "cursor preview" scene layer.
//
// Tools push lightweight Entity snapshots in here while a command is in
// flight (e.g. a rubber-band line from the first point to the cursor).
// CanvasHost uploads the union of committed + transient entities to the
// renderer each frame and clears the transient set on commit / cancel.
//
// Ids are namespaced so they can't collide with persistent entities:
// transient-only ids prefix with `"transient:"`.
import type { Entity, Id } from "@modcad/core";

export class RubberBand {
  private entities = new Map<Id, Entity>();
  private subscribers = new Set<() => void>();

  set(id: Id, entity: Entity): void {
    this.entities.set(id, entity);
    this.emit();
  }

  remove(id: Id): void {
    if (this.entities.delete(id)) this.emit();
  }

  clear(): void {
    if (this.entities.size === 0) return;
    this.entities.clear();
    this.emit();
  }

  list(): Entity[] {
    return Array.from(this.entities.values());
  }

  ids(): Id[] {
    return Array.from(this.entities.keys());
  }

  /** Subscribe to "contents changed"; returns an unsubscribe fn. */
  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private emit(): void {
    for (const cb of this.subscribers) cb();
  }
}
