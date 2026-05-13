// Layer command errors (T073, FR-012).
//
// All layer-mutation commands throw a typed Error subclass at the
// command-construction or command-apply boundary so the UI can show a
// non-modal notification with a stable message id while still letting
// callers `instanceof` for control flow.

export class LayerLockedError extends Error {
  readonly code = "layer-locked";
  constructor(public readonly layerId: string, public readonly layerName: string) {
    super(`layer "${layerName}" is locked`);
    this.name = "LayerLockedError";
  }
}

export class LayerFrozenError extends Error {
  readonly code = "layer-frozen";
  constructor(public readonly layerId: string, public readonly layerName: string) {
    super(`layer "${layerName}" is frozen`);
    this.name = "LayerFrozenError";
  }
}

export class UndeletableLayerError extends Error {
  readonly code = "layer-undeletable";
  constructor(public readonly layerId: string, public readonly layerName: string) {
    super(`layer "${layerName}" cannot be deleted`);
    this.name = "UndeletableLayerError";
  }
}

export class LayerNotFoundError extends Error {
  readonly code = "layer-not-found";
  constructor(public readonly layerId: string) {
    super(`layer "${layerId}" not found`);
    this.name = "LayerNotFoundError";
  }
}
