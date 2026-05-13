// File System Access API wrapper with a download/upload fallback for
// browsers without WICG support (or for headless Chromium where the
// picker isn't surfaced).
//
// The shape is deliberately small: one save call (bytes + suggested
// name), one open call (returns bytes + name). Anything richer (file
// handle persistence for Save-As-handle, drag-drop, IndexedDB-handle
// cache) lands with later tasks.
//
// Tests can swap the underlying impl via `installFsAccessOverrides`
// — the dev API exposes that so Playwright can intercept the call.

/** Result of opening a file. */
export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
}

export interface FsAccessOverrides {
  save?: (bytes: Uint8Array, suggestedName: string) => Promise<string | null>;
  open?: () => Promise<OpenedFile | null>;
}

let overrides: FsAccessOverrides | null = null;

export function installFsAccessOverrides(o: FsAccessOverrides | null): void {
  overrides = o;
}

interface PickerWindow extends Window {
  // WICG types are experimental; cast at the boundary.
  showSaveFilePicker?: (opts?: unknown) => Promise<unknown>;
  showOpenFilePicker?: (opts?: unknown) => Promise<unknown>;
}

/**
 * Save bytes to disk. Returns the chosen file name (or null if cancelled).
 * Uses showSaveFilePicker when available; falls back to a download anchor.
 */
export async function saveBytes(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<string | null> {
  if (overrides?.save) {
    return overrides.save(bytes, suggestedName);
  }
  const w = window as PickerWindow;
  if (typeof w.showSaveFilePicker === "function") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle: any = await w.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "ModCad drawing",
            accept: { "application/x-modcad": [".modcad"] },
          },
        ],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writable: any = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return handle.name as string;
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "AbortError" || err.name === "NotAllowedError")
      ) {
        return null;
      }
      // Fall through to download fallback.
    }
  }
  // Download fallback.
  const blob = new Blob([bytes], { type: "application/x-modcad" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return suggestedName;
}

/**
 * Open a file from disk. Returns null if the user cancelled.
 */
export async function openBytes(): Promise<OpenedFile | null> {
  if (overrides?.open) {
    return overrides.open();
  }
  const w = window as PickerWindow;
  if (typeof w.showOpenFilePicker === "function") {
    try {
      const handles = (await w.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "ModCad drawing",
            accept: { "application/x-modcad": [".modcad"] },
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any[];
      const handle = handles[0];
      if (!handle) return null;
      const file: File = await handle.getFile();
      const buf = await file.arrayBuffer();
      return { name: file.name, bytes: new Uint8Array(buf) };
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "AbortError" || err.name === "NotAllowedError")
      ) {
        return null;
      }
      // Fall through to input fallback.
    }
  }
  // Input fallback.
  return await new Promise<OpenedFile | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".modcad,application/x-modcad";
    input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const buf = await file.arrayBuffer();
      resolve({ name: file.name, bytes: new Uint8Array(buf) });
    };
    input.oncancel = () => resolve(null);
    document.body.appendChild(input);
    input.click();
    input.remove();
  });
}
