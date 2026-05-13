// PointerEvents-only input adapter. Constitution Principle: web inputs
// route through PointerEvents exclusively — no mouse/touch listeners
// anywhere (they conflate stylus, finger, and mouse and break
// pressure-sensitive workflows).
//
// The CanvasHost owns one PointerInput per <canvas> and wires its
// `screenToWorld` projector before dispatching events. Tools subscribe
// to events; the host fans incoming PointerEvents through this class.
import type { Vec2Type } from "@modcad/core";

export interface PointerSample {
  /** World-space coordinates (post-camera). */
  world: Vec2Type;
  /** Raw client-space coordinates relative to the canvas element. */
  screen: [number, number];
  /** Which mouse / pen button triggered the event (PointerEvent.button). */
  button: number;
  /** PointerEvent.buttons bitmask (held buttons during a move). */
  buttons: number;
  /** Pointer type — useful for tools that treat stylus differently. */
  pointerType: string;
  /** Spacebar-modifier piggybacks on PointerInput so tools see one cursor. */
  spaceHeld: boolean;
}

export type PointerListener = (s: PointerSample) => void;
export type KeyListener = (e: KeyboardEvent) => void;

export interface PointerInputOptions {
  canvas: HTMLCanvasElement;
  screenToWorld: (screen: [number, number]) => Vec2Type;
}

/**
 * Lightweight pub/sub over PointerEvents + a narrow keydown surface.
 * No tool-specific knowledge lives here.
 */
export class PointerInput {
  private readonly canvas: HTMLCanvasElement;
  private screenToWorld: (screen: [number, number]) => Vec2Type;

  private readonly downHandlers = new Set<PointerListener>();
  private readonly moveHandlers = new Set<PointerListener>();
  private readonly upHandlers = new Set<PointerListener>();
  private readonly keyDownHandlers = new Set<KeyListener>();
  private readonly keyUpHandlers = new Set<KeyListener>();

  private spaceHeld = false;

  constructor(opts: PointerInputOptions) {
    this.canvas = opts.canvas;
    this.screenToWorld = opts.screenToWorld;
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    // Listen on window for key events so the canvas doesn't need focus —
    // CAD muscle memory expects shortcuts to fire from anywhere in-app.
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  /** Re-bind the screen-to-world projector (called when zoom/pan change). */
  setScreenToWorld(fn: (screen: [number, number]) => Vec2Type): void {
    this.screenToWorld = fn;
  }

  isSpaceHeld(): boolean {
    return this.spaceHeld;
  }

  onPointerDownEvt(listener: PointerListener): () => void {
    this.downHandlers.add(listener);
    return () => this.downHandlers.delete(listener);
  }
  onPointerMoveEvt(listener: PointerListener): () => void {
    this.moveHandlers.add(listener);
    return () => this.moveHandlers.delete(listener);
  }
  onPointerUpEvt(listener: PointerListener): () => void {
    this.upHandlers.add(listener);
    return () => this.upHandlers.delete(listener);
  }
  onKeyDownEvt(listener: KeyListener): () => void {
    this.keyDownHandlers.add(listener);
    return () => this.keyDownHandlers.delete(listener);
  }
  onKeyUpEvt(listener: KeyListener): () => void {
    this.keyUpHandlers.add(listener);
    return () => this.keyUpHandlers.delete(listener);
  }

  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.downHandlers.clear();
    this.moveHandlers.clear();
    this.upHandlers.clear();
    this.keyDownHandlers.clear();
    this.keyUpHandlers.clear();
  }

  private sample(e: PointerEvent): PointerSample {
    const rect = this.canvas.getBoundingClientRect();
    const screen: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
    return {
      world: this.screenToWorld(screen),
      screen,
      button: e.button,
      buttons: e.buttons,
      pointerType: e.pointerType,
      spaceHeld: this.spaceHeld,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    // capture so move/up still come to us if the user drags off-canvas.
    this.canvas.setPointerCapture(e.pointerId);
    const s = this.sample(e);
    for (const h of this.downHandlers) h(s);
  };
  private onPointerMove = (e: PointerEvent): void => {
    const s = this.sample(e);
    for (const h of this.moveHandlers) h(s);
  };
  private onPointerUp = (e: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    const s = this.sample(e);
    for (const h of this.upHandlers) h(s);
  };
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "Space") this.spaceHeld = true;
    for (const h of this.keyDownHandlers) h(e);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") this.spaceHeld = false;
    for (const h of this.keyUpHandlers) h(e);
  };
}
