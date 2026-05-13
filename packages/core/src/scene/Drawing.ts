// Drawing construction + layer-level mutations. Entity-level mutations
// go through the CommandBus (T022+) so they're undoable; the helpers
// here are the only "raw" path and exist solely for tests, codecs, and
// kernel-internal use.
import { newId } from "../ids.js";
import type { Id } from "../ids.js";
import { ZERO } from "../geometry/Vec2.js";
import type {
  Drawing,
  DrawingSettings,
  Entity,
  Layer,
  Unit,
} from "./types.js";
import { defaultDimensionStyle } from "./dimensionStyle.js";

const DEFAULT_LAYER_COLOR = { r: 1, g: 1, b: 1, a: 1 };

export function defaultSettings(): DrawingSettings {
  return {
    grid: { visible: true, size: [10, 10], snap: false },
    orthoMode: false,
    polarAngles: [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI],
    snapModes: new Set(["endpoint", "midpoint", "center", "intersection", "grid"]),
    pointStyle: { mode: "dot", size: 2, sizeInPixels: true },
  };
}

export function defaultLayer(): Layer {
  return {
    id: newId(),
    name: "0",
    color: DEFAULT_LAYER_COLOR,
    lineweight: 0.25,
    visible: true,
    locked: false,
    frozen: false,
  };
}

export interface NewDrawingOptions {
  units?: Unit;
  precision?: number;
}

export function newDrawing(opts: NewDrawingOptions = {}): Drawing {
  const layer = defaultLayer();
  const dimStyle = defaultDimensionStyle();
  return {
    version: "1.0",
    units: opts.units ?? "mm",
    precision: opts.precision ?? 3,
    originOffset: ZERO,
    precisionTier: "A",
    layers: [layer],
    layerOrder: [layer.id],
    currentLayerId: layer.id,
    entities: {},
    entityOrder: [],
    settings: defaultSettings(),
    dimensionStyles: { [dimStyle.id]: dimStyle },
    defaultDimensionStyleId: dimStyle.id,
    extra: {},
  };
}

export function getCurrentLayer(d: Drawing): Layer {
  const layer = d.layers.find((l) => l.id === d.currentLayerId);
  if (!layer) throw new Error(`current layer ${d.currentLayerId} not in drawing`);
  return layer;
}

export function getLayer(d: Drawing, id: Id): Layer | undefined {
  return d.layers.find((l) => l.id === id);
}

export function getEntity(d: Drawing, id: Id): Entity | undefined {
  return d.entities[id];
}

export function listVisibleEntities(d: Drawing): Entity[] {
  const visibleLayers = new Set(
    d.layers.filter((l) => l.visible && !l.frozen).map((l) => l.id),
  );
  const out: Entity[] = [];
  for (const id of d.entityOrder) {
    const e = d.entities[id];
    if (e && visibleLayers.has(e.layerId)) out.push(e);
  }
  return out;
}
