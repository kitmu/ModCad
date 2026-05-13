// Stable opaque identifiers for entities, layers, dimensions, commands.
// Using ULID for: lexicographic sortability (creation order without a
// separate field), 128-bit collision resistance, URL-safe encoding.
// Per data-model.md: ids are never reused on undo — re-adding an entity
// allocates a fresh id.
import { ulid } from "ulid";

export type Id = string & { readonly __brand: "Id" };

export function newId(): Id {
  return ulid() as Id;
}

/** Lift an external string into the Id brand without generating a new one. */
export function asId(s: string): Id {
  return s as Id;
}
