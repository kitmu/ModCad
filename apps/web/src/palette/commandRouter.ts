// Command router (T066 wiring).
//
// The kernel registry (packages/core/src/commands/registry.ts) lists
// *what* commands exist; the router maps a canonical command name to
// the actual UI-side handler. Two callers feed it: the palette and
// the keybinding key handler.
//
// CanvasHost registers handlers for the draw/view commands when it
// mounts (it owns the active tool slot); the file/settings handlers
// register globally because they don't need canvas context.
import type { Vec2Type } from "@modcad/core";

export interface CommandRouter {
  /** Bind (or rebind) a command's handler. */
  register: (name: string, handler: CommandHandler) => void;
  /** Look up + invoke a command. Returns false if no handler is bound. */
  dispatch: (name: string) => boolean;
  /** Forward a typed coordinate to whichever tool is currently active. */
  sendCoordinate: (point: Vec2Type) => boolean;
  /** Most-recent committed point of the active tool, for parseCoord context. */
  lastPoint: () => Vec2Type | null;
  /** Register the active-tool accessor (called by CanvasHost). */
  setActiveToolAccessor: (
    accessor: () => ToolCoordinateSink | null,
  ) => void;
}

export interface ToolCoordinateSink {
  onCoordinate?(point: Vec2Type): void;
  lastPoint?(): Vec2Type | null;
}

export type CommandHandler = () => void;

const handlers = new Map<string, CommandHandler>();
let activeToolAccessor: () => ToolCoordinateSink | null = () => null;

export const commandRouter: CommandRouter = {
  register: (name, handler) => {
    handlers.set(name, handler);
  },
  dispatch: (name) => {
    const h = handlers.get(name);
    if (!h) return false;
    h();
    return true;
  },
  sendCoordinate: (point) => {
    const tool = activeToolAccessor();
    if (!tool?.onCoordinate) return false;
    tool.onCoordinate(point);
    return true;
  },
  lastPoint: () => activeToolAccessor()?.lastPoint?.() ?? null,
  setActiveToolAccessor: (accessor) => {
    activeToolAccessor = accessor;
  },
};
