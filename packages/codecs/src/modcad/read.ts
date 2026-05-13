// .modcad reader — ungzip → JSON.parse → validate envelope.
// Unknown top-level envelope fields land in `extra`. Unknown entity `kind`s
// are passed through; the kernel narrows back to `Entity` only when iterating.
import { ungzip } from "pako";
import type { Drawing, Entity, SnapMode } from "@modcad/core";

export interface ModcadReadResult {
  drawing: Drawing;
  extra: Record<string, unknown>;
}

/** Entity slot in a freshly-read Drawing: either a known kind or an opaque carrier. */
export type EntityOrUnknown = Entity | { kind: string; [k: string]: unknown };

const KNOWN_ENVELOPE_KEYS = new Set(["format", "version", "drawing", "extra"]);

function asRecord(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("not a modcad file");
  }
  return v as Record<string, unknown>;
}

/** Rehydrate the snapModes array → Set; leave other fields alone. */
function rehydrateDrawing(d: Record<string, unknown>): Drawing {
  const settings = d["settings"];
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const s = settings as Record<string, unknown>;
    const modes = s["snapModes"];
    if (Array.isArray(modes)) {
      s["snapModes"] = new Set(modes as SnapMode[]);
    }
  }
  // Trust the producer for the rest: the .modcad envelope is our own format,
  // and entity-kind validity is enforced lazily by consumers (unknown kinds
  // round-trip per the spec edge case).
  return d as unknown as Drawing;
}

/**
 * Parse gzipped .modcad bytes back to a Drawing plus the preserved `extra`
 * top-level envelope fields. Throws `Error("not a modcad file")` if the
 * `format` discriminator is missing or wrong.
 */
export function readModcad(bytes: Uint8Array): ModcadReadResult {
  const text = ungzip(bytes, { to: "string" });
  const parsed: unknown = JSON.parse(text);
  const env = asRecord(parsed);
  if (env["format"] !== "modcad") {
    throw new Error("not a modcad file");
  }
  if (typeof env["version"] !== "string") {
    throw new Error("not a modcad file");
  }
  if (!env["drawing"]) {
    throw new Error("not a modcad file");
  }
  const drawing = rehydrateDrawing(asRecord(env["drawing"]));

  // Merge envelope-level extras: explicit `extra` field plus any unknown keys.
  const extra: Record<string, unknown> = {
    ...(env["extra"] && typeof env["extra"] === "object"
      ? (env["extra"] as Record<string, unknown>)
      : {}),
  };
  for (const [k, v] of Object.entries(env)) {
    if (!KNOWN_ENVELOPE_KEYS.has(k)) extra[k] = v;
  }
  return { drawing, extra };
}
