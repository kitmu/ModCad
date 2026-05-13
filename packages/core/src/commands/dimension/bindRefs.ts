// Shared helper for dimension command apply/inverse paths.
//
// Each dimension command owns a single `DimensionEntity` and a set of
// referenced entity ids. The DimensionGraph (one per CommandBus) is
// kept in sync here so the associative re-flow code (T082) can look
// up "what dimensions are bound to entity X?" in O(bound).
//
// The graph lives outside the immer-managed Drawing snapshot — it's a
// pure index, rebuilt on load and mutated alongside dimension lifecycle
// events. We expose a single function pair that any dimension command
// can call.
import type { Id } from "../../ids.js";
import type {
  DimensionEntity,
  DimensionRef,
  EntityPointRef,
} from "../../scene/types.js";
import type { DimensionGraph } from "../../scene/dimensionGraph.js";

/** Module-level singleton graph. Set by the bus on construction. */
let activeGraph: DimensionGraph | null = null;

/** Wire the bus's graph so dimension commands can keep it in sync. */
export function setActiveDimensionGraph(g: DimensionGraph | null): void {
  activeGraph = g;
}

export function getActiveDimensionGraph(): DimensionGraph | null {
  return activeGraph;
}

/** Collect every entity id referenced by `ref`. */
export function entityIdsForRef(ref: DimensionRef): Id[] {
  const out: Id[] = [];
  switch (ref.variant) {
    case "aligned":
    case "linear":
      pushIfRef(out, ref.a);
      pushIfRef(out, ref.b);
      return out;
    case "angular":
      pushIfRef(out, ref.a);
      pushIfRef(out, ref.b);
      return out;
    case "radial":
    case "diameter":
      out.push(ref.entity);
      return out;
    default: {
      const _exhaustive: never = ref;
      throw new Error(
        `entityIdsForRef: unknown variant ${String((_exhaustive as { variant: string }).variant)}`,
      );
    }
  }
}

function pushIfRef(
  out: Id[],
  p: unknown,
): void {
  if (
    p !== null &&
    typeof p === "object" &&
    "entityId" in (p as object) &&
    typeof (p as EntityPointRef).entityId === "string"
  ) {
    out.push((p as EntityPointRef).entityId);
  }
}

/** Bind every referenced entity → dimension in the active graph. */
export function bindDimension(dim: DimensionEntity): void {
  const g = activeGraph;
  if (!g) return;
  for (const id of entityIdsForRef(dim.refs)) {
    g.bind(id, dim.id);
  }
}

/** Inverse: undo every binding made by `bindDimension(dim)`. */
export function unbindDimension(dim: DimensionEntity): void {
  const g = activeGraph;
  if (!g) return;
  for (const id of entityIdsForRef(dim.refs)) {
    g.unbind(id, dim.id);
  }
}
