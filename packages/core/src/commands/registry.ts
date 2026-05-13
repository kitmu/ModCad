// Command registry — the kernel-owned catalog of every action the UI
// can invoke (FR-023 / FR-024 / US2). The kernel only knows *what*
// commands exist (name, aliases, default binding, summary). It does
// not know *how* to execute them: handlers are bound by the UI layer
// (apps/web) which has access to React state, the active tool slot,
// and the document store.
//
// Each definition is identified by a canonical dot-namespaced `name`
// (e.g. `draw.line`). `aliases` carry AutoCAD-style shorthands (`L`,
// `REC`, `PL`, …) used by the command-line bar and matched by the
// palette's fuzzy ranker. `defaultBinding` is the single-key shortcut
// the global keybinding map seeds from (the user can override it).
export interface CommandDefinition {
  /** Canonical, dot-namespaced identifier, e.g. `"draw.line"`. */
  name: string;
  /** AutoCAD-style aliases that should match the same command. */
  aliases: string[];
  /** Default single-key shortcut (case-insensitive); may be undefined. */
  defaultBinding?: string;
  /** One-line description shown in palette result rows. */
  summary: string;
}

export class CommandRegistry {
  private readonly defs = new Map<string, CommandDefinition>();

  register(def: CommandDefinition): void {
    if (this.defs.has(def.name)) {
      throw new Error(`CommandRegistry: duplicate command ${def.name}`);
    }
    this.defs.set(def.name, def);
  }

  all(): CommandDefinition[] {
    return [...this.defs.values()];
  }

  byName(name: string): CommandDefinition | undefined {
    return this.defs.get(name);
  }
}

/**
 * Pre-populated registry for the v1 command surface. AutoCAD aliases
 * are present where the corresponding standard shortcut is unambiguous
 * (`L`, `REC`, `PL`, `C`, `A`, `EL`, `PT`, `U`, `Z`, `P`).
 *
 * The single-letter `defaultBinding`s match the existing US1
 * shortcut map in CanvasHost so the palette's binding overlay and
 * the canvas-level handler stay in sync until the keybinding store
 * takes ownership (T068).
 */
export const builtinRegistry: CommandRegistry = (() => {
  const r = new CommandRegistry();
  const defs: CommandDefinition[] = [
    {
      name: "draw.line",
      aliases: ["L", "LINE"],
      defaultBinding: "L",
      summary: "Draw a line segment from two points.",
    },
    {
      name: "draw.rectangle",
      aliases: ["REC", "RECTANGLE", "R"],
      defaultBinding: "R",
      summary: "Draw a rectangle from two opposite corners.",
    },
    {
      name: "draw.polyline",
      aliases: ["PL", "POLYLINE"],
      defaultBinding: "P",
      summary: "Draw a connected sequence of line segments.",
    },
    {
      name: "draw.circle",
      aliases: ["C", "CIRCLE"],
      defaultBinding: "C",
      summary: "Draw a circle (center + radius).",
    },
    {
      name: "draw.arc",
      aliases: ["A", "ARC"],
      defaultBinding: "A",
      summary: "Draw a circular arc.",
    },
    {
      name: "draw.ellipse",
      aliases: ["EL", "ELLIPSE"],
      defaultBinding: "E",
      summary: "Draw an ellipse from center, major axis, and minor radius.",
    },
    {
      name: "draw.point",
      aliases: ["PT", "POINT"],
      defaultBinding: "O",
      summary: "Place a point entity.",
    },
    {
      name: "view.pan",
      aliases: ["PAN"],
      summary: "Pan the view.",
    },
    {
      name: "view.zoom",
      aliases: ["Z", "ZOOM"],
      summary: "Zoom the view.",
    },
    {
      name: "view.fit",
      aliases: ["ZF", "FIT"],
      defaultBinding: "F",
      summary: "Zoom to fit all visible entities.",
    },
    {
      name: "settings.ortho",
      aliases: ["ORTHO"],
      summary: "Toggle ortho-constraint mode.",
    },
    {
      name: "settings.polar",
      aliases: ["POLAR"],
      summary: "Toggle polar-tracking mode.",
    },
    {
      name: "file.new",
      aliases: ["NEW"],
      summary: "Open a new drawing.",
    },
    {
      name: "file.open",
      aliases: ["OPEN"],
      summary: "Open a drawing from disk.",
    },
    {
      name: "file.save",
      aliases: ["SAVE"],
      summary: "Save the active drawing.",
    },
    {
      name: "file.saveAs",
      aliases: ["SAVEAS"],
      summary: "Save the active drawing under a new name.",
    },
    {
      name: "edit.undo",
      aliases: ["U", "UNDO"],
      summary: "Undo the last action.",
    },
    {
      name: "edit.redo",
      aliases: ["REDO"],
      summary: "Redo the most recently undone action.",
    },
    {
      name: "modify.move",
      aliases: ["M", "MOVE"],
      defaultBinding: "M",
      summary: "Move selected entities.",
    },
    {
      name: "modify.trim",
      aliases: ["TR", "TRIM"],
      defaultBinding: "T",
      summary: "Trim entities to cutting edges (Quick or Classic).",
    },
  ];
  for (const d of defs) r.register(d);
  return r;
})();
