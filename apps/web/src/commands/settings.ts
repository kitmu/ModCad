// Undoable toggles for DrawingSettings flags (FR-006: every mutation is
// undoable, including UI-level settings the user might want to revert).
//
// Lives in apps/web/src/commands/ rather than @modcad/core because the
// kernel ships the settings shape, but the ortho/polar toggles are a
// web-UX choice (they could be omitted from a headless / batch caller).
import type { Command, Drawing } from "@modcad/core";
import type { Draft } from "immer";

export function setOrthoCommand(next: boolean): Command<{ next: boolean }> {
  let prev = false;
  return {
    name: "settings.ortho",
    params: { next },
    apply(draft: Draft<Drawing>) {
      prev = draft.settings.orthoMode;
      draft.settings.orthoMode = next;
    },
    inverse(draft: Draft<Drawing>) {
      draft.settings.orthoMode = prev;
    },
  };
}

export function setPolarCommand(next: boolean): Command<{ next: boolean }> {
  // Polar-on means "snap to polar angles"; we encode it as a non-empty
  // polarAngles array vs an empty one to avoid a new flag on
  // DrawingSettings. Stash the previous list so the inverse restores
  // the user's exact angle set.
  let prevAngles: number[] = [];
  return {
    name: "settings.polar",
    params: { next },
    apply(draft: Draft<Drawing>) {
      prevAngles = [...draft.settings.polarAngles];
      if (next && prevAngles.length === 0) {
        draft.settings.polarAngles = [
          0,
          Math.PI / 4,
          Math.PI / 2,
          (3 * Math.PI) / 4,
          Math.PI,
        ];
      } else if (!next) {
        draft.settings.polarAngles = [];
      }
    },
    inverse(draft: Draft<Drawing>) {
      draft.settings.polarAngles = [...prevAngles];
    },
  };
}
