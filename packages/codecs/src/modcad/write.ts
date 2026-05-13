// .modcad writer — gzip(JSON.stringify(envelope)).
// Envelope: { format: "modcad", version: "1.0", drawing, extra }.
import { gzip } from "pako";
import type { Drawing } from "@modcad/core";

/** A `Set` becomes `[...]` and the snapModes set is restored in read.ts. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) return Array.from(value);
  return value;
}

export interface ModcadEnvelope {
  format: "modcad";
  version: "1.0";
  drawing: Drawing;
  extra: Record<string, unknown>;
}

/**
 * Serialize a Drawing to gzipped JSON bytes.
 * `extra` carries any unknown top-level envelope fields preserved on prior read,
 * so the byte stream round-trips losslessly.
 */
export function writeModcad(
  drawing: Drawing,
  extra: Record<string, unknown> = {},
): Uint8Array {
  const envelope: ModcadEnvelope = {
    format: "modcad",
    version: "1.0",
    drawing,
    extra,
  };
  const json = JSON.stringify(envelope, replacer);
  return gzip(json);
}
