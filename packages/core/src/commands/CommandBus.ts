// Command bus + undo stack — FR-006, FR-006a.
//
// Design choices, recorded so future readers don't have to reverse-engineer:
//
// 1. Immer `produce` drafts. Commands mutate freely; the bus produces a
//    new frozen snapshot per call. We do NOT use `produceWithPatches` —
//    each Command owns its own `inverse(draft)` so the bus stays
//    agnostic to patch shape and the constitution's "every mutation
//    goes through a single command bus that records its own inverse"
//    requirement is met by the command, not the patch machinery.
//
// 2. Two stacks: `undoStack` and `redoStack`. A committed action pushes
//    onto `undoStack` and clears `redoStack`. Undo pops `undoStack`,
//    applies the inverse, and pushes onto `redoStack`. No depth cap
//    (per FR-006 "no upper bound on undo depth … memory permitting").
//
// 3. Multi-step (FR-006a). `beginCommand` runs `cmd.apply` to set up
//    the in-flight state (e.g. an empty polyline shell) and snapshots
//    the pre-begin drawing so `cancel()` can restore it exactly.
//    Each `pushSubStep` applies its `apply` and stores its `inverse`.
//    `undoStep` reverts only the last sub-step. `commitCommand`
//    packages the whole {cmd, subSteps[]} into ONE undo entry so a
//    later global undo treats it as a single unit — the user sees
//    the same command go away in one Ctrl-Z.
//
// 4. Listeners (`on`/`emit`) are the only side channel. The bus owns
//    no DOM, no React, no global state. Callers (renderer, codecs,
//    precision rebase) emit their own `KernelEvent`s through the bus
//    so consumers have a single subscription point.
import { produce, freeze, type Draft } from "immer";
import type { Drawing, KernelEvent } from "../scene/types.js";
import { DimensionGraph } from "../scene/dimensionGraph.js";
import {
  setActiveDimensionGraph,
} from "./dimension/bindRefs.js";

export interface SubStep {
  apply(draft: Draft<Drawing>): void;
  inverse(draft: Draft<Drawing>): void;
}

export interface Command<Params = unknown> {
  name: string;
  params: Params;
  apply(draft: Draft<Drawing>): void;
  inverse(draft: Draft<Drawing>): void;
  // Optional pre-seeded sub-operations. Most callers push sub-steps
  // dynamically via `pushSubStep` instead; this field exists so a
  // command can also be authored as a single self-contained unit.
  subSteps?: SubStep[];
}

interface UndoEntry {
  cmd: Command<unknown>;
  subSteps: SubStep[];
}

interface InFlight {
  cmd: Command<unknown>;
  // Snapshot of the drawing before `beginCommand` ran, used by
  // `cancel()` to restore exactly. Faster and more robust than
  // replaying inverses for arbitrary multi-step commands.
  preBegin: Drawing;
  subSteps: SubStep[];
}

export type KernelEventListener = (e: KernelEvent) => void;

export class CommandBus {
  private current: Drawing;
  private readonly undoStack: UndoEntry[] = [];
  private readonly redoStack: UndoEntry[] = [];
  private inFlight: InFlight | null = null;
  private readonly listeners = new Set<KernelEventListener>();
  /**
   * Dimension dependency graph (FR-014). One per bus; dimension commands
   * mutate it via the active-graph hook in commands/dimension/bindRefs.ts.
   * Rebuilt on load (codec) — initially empty for a fresh drawing.
   */
  readonly dimensionGraph: DimensionGraph = new DimensionGraph();

  constructor(initial: Drawing) {
    this.current = freeze(initial, true);
  }

  get drawing(): Drawing {
    return this.current;
  }

  private withActiveGraph<T>(fn: () => T): T {
    setActiveDimensionGraph(this.dimensionGraph);
    try {
      return fn();
    } finally {
      setActiveDimensionGraph(null);
    }
  }

  execute<T>(cmd: Command<T>): void {
    if (this.inFlight) {
      throw new Error(
        `cannot execute("${cmd.name}") while command "${this.inFlight.cmd.name}" is in flight`,
      );
    }
    this.withActiveGraph(() => {
      this.current = produce(this.current, (draft) => {
        cmd.apply(draft);
        if (cmd.subSteps) {
          for (const s of cmd.subSteps) s.apply(draft);
        }
      });
    });
    this.undoStack.push({
      cmd: cmd as Command<unknown>,
      subSteps: cmd.subSteps ? [...cmd.subSteps] : [],
    });
    this.redoStack.length = 0;
  }

  undo(): boolean {
    if (this.inFlight) {
      // Per spec: in-flight commands are reverted step-by-step via
      // `undoStep`, not by `undo`. Refuse rather than silently doing
      // the wrong thing.
      return false;
    }
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.withActiveGraph(() => {
      this.current = produce(this.current, (draft) => {
        for (let i = entry.subSteps.length - 1; i >= 0; i--) {
          entry.subSteps[i]!.inverse(draft);
        }
        entry.cmd.inverse(draft);
      });
    });
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    if (this.inFlight) return false;
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.withActiveGraph(() => {
      this.current = produce(this.current, (draft) => {
        entry.cmd.apply(draft);
        for (const s of entry.subSteps) s.apply(draft);
      });
    });
    this.undoStack.push(entry);
    return true;
  }

  beginCommand<T>(cmd: Command<T>): void {
    if (this.inFlight) {
      throw new Error(
        `cannot begin "${cmd.name}" while "${this.inFlight.cmd.name}" is in flight`,
      );
    }
    const preBegin = this.current;
    this.withActiveGraph(() => {
      this.current = produce(this.current, (draft) => {
        cmd.apply(draft);
      });
    });
    this.inFlight = {
      cmd: cmd as Command<unknown>,
      preBegin,
      subSteps: [],
    };
  }

  pushSubStep(step: SubStep): void {
    if (!this.inFlight) {
      throw new Error("pushSubStep called with no command in flight");
    }
    this.withActiveGraph(() => {
      this.current = produce(this.current, (draft) => {
        step.apply(draft);
      });
    });
    this.inFlight.subSteps.push(step);
  }

  undoStep(): boolean {
    if (!this.inFlight) return false;
    const step = this.inFlight.subSteps.pop();
    if (!step) return false;
    this.withActiveGraph(() => {
      this.current = produce(this.current, (draft) => {
        step.inverse(draft);
      });
    });
    return true;
  }

  commitCommand(): void {
    if (!this.inFlight) {
      throw new Error("commitCommand called with no command in flight");
    }
    const entry: UndoEntry = {
      cmd: this.inFlight.cmd,
      subSteps: [...this.inFlight.subSteps],
    };
    this.undoStack.push(entry);
    this.redoStack.length = 0;
    this.inFlight = null;
  }

  cancel(): void {
    if (!this.inFlight) return;
    // Restore the pre-begin snapshot byte-for-byte. Cheaper and more
    // foolproof than replaying inverses, and guarantees zero draft
    // residue per the T026 "no draft state leaks on cancel" check.
    this.current = this.inFlight.preBegin;
    this.inFlight = null;
  }

  on(listener: KernelEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(e: KernelEvent): void {
    for (const l of this.listeners) l(e);
  }
}
