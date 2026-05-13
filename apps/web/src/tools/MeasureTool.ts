// T084 — Measure tool.
//
// Three modes:
//   - distance: two clicks → straight-line distance.
//   - angle:    three clicks (vertex, then two rays) → angle in degrees.
//   - area:     N clicks + Enter → polygon area via the shoelace
//               formula. Polygon is implicitly closed back to the first
//               point.
//
// Default mode is `distance`. Press `a` while the tool is active to
// switch to angle, `s` to switch to area (mnemonic: shoelace), `d`
// back to distance.
//
// Does NOT persist entities. Updates `useMeasureState` after each
// click; the MeasureOverlay renders from that slice.
import type { Vec2Type } from "@modcad/core";
import { useCommandState } from "../state/commandState.js";
import { useMeasureState, type MeasureMode } from "../state/measureState.js";
import { useSnapState } from "../state/snapState.js";
import { snapEndpoint } from "../canvas/snapHelper.js";
import { clone, type Tool, type ToolContext } from "./Tool.js";
import type { PointerSample } from "../canvas/PointerInput.js";

export class MeasureTool implements Tool {
  readonly name = "measure";
  private ctx!: ToolContext;
  private mode: MeasureMode = "distance";
  private points: Vec2Type[] = [];

  start(ctx: ToolContext): void {
    this.ctx = ctx;
    this.points = [];
    useMeasureState.getState().set(null);
    this.setStep();
  }

  onPointerMove(p: PointerSample): void {
    const hit = snapEndpoint(p.world, this.ctx.bus.drawing, 1);
    const cursor = hit ? hit.point : p.world;
    if (hit) {
      useSnapState.getState().setMarker({
        point: hit.point,
        mode: hit.mode,
        strength: hit.strength,
        lastCommittedPoint: this.points[this.points.length - 1] ?? null,
      });
    } else {
      useSnapState.getState().setMarker(null);
    }
    // Live preview readout including the current cursor.
    if (this.points.length > 0) {
      const tentative = [...this.points, cursor];
      const readout = this.computeReadout(tentative, /*final*/ false);
      if (readout) useMeasureState.getState().set(readout);
    }
  }

  onPointerDown(p: PointerSample): void {
    if (p.button !== 0) return;
    const hit = snapEndpoint(p.world, this.ctx.bus.drawing, 1);
    const target: Vec2Type = hit ? hit.point : p.world;
    this.points.push(clone(target));

    if (this.mode === "distance" && this.points.length === 2) {
      const readout = this.computeReadout(this.points, /*final*/ true);
      if (readout) useMeasureState.getState().set(readout);
      // Reset for next measurement; keep tool active.
      this.points = [];
    } else if (this.mode === "angle" && this.points.length === 3) {
      const readout = this.computeReadout(this.points, /*final*/ true);
      if (readout) useMeasureState.getState().set(readout);
      this.points = [];
    } else {
      // For area mode (and intermediate clicks of others), refresh
      // the readout with the points collected so far.
      const readout = this.computeReadout(this.points, /*final*/ false);
      if (readout) useMeasureState.getState().set(readout);
    }
    this.setStep();
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.points = [];
      useMeasureState.getState().set(null);
      useSnapState.getState().setMarker(null);
      useCommandState.getState().clear();
      this.ctx.done();
      return;
    }
    if (e.key === "Enter" && this.mode === "area" && this.points.length >= 3) {
      const readout = this.computeReadout(this.points, /*final*/ true);
      if (readout) useMeasureState.getState().set(readout);
      this.points = [];
      this.setStep();
      return;
    }
    // Mode swaps. Only valid when no points yet.
    if (this.points.length === 0) {
      if (e.key.toLowerCase() === "d") {
        this.mode = "distance";
        this.setStep();
      } else if (e.key.toLowerCase() === "a") {
        this.mode = "angle";
        this.setStep();
      } else if (e.key.toLowerCase() === "s") {
        this.mode = "area";
        this.setStep();
      }
    }
  }

  dispose(): void {
    useMeasureState.getState().set(null);
  }

  private computeReadout(points: Vec2Type[], final: boolean): import("../state/measureState.js").MeasureReadout | null {
    if (points.length === 0) return null;
    switch (this.mode) {
      case "distance": {
        if (points.length < 2) return null;
        const a = points[0]!;
        const b = points[points.length - 1]!;
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        return {
          mode: "distance",
          points: [a, b],
          value: d,
          label: `dist ${d.toFixed(3)} @ ${ang.toFixed(2)}°${final ? "" : "…"}`,
        };
      }
      case "angle": {
        if (points.length < 3) {
          if (points.length === 2) {
            return {
              mode: "angle",
              points,
              value: 0,
              label: "Pick second ray endpoint…",
            };
          }
          return null;
        }
        const v = points[0]!;
        const a = points[1]!;
        const b = points[2]!;
        const angA = Math.atan2(a[1] - v[1], a[0] - v[0]);
        const angB = Math.atan2(b[1] - v[1], b[0] - v[0]);
        let sweep = angB - angA;
        while (sweep <= -Math.PI) sweep += Math.PI * 2;
        while (sweep > Math.PI) sweep -= Math.PI * 2;
        const deg = Math.abs((sweep * 180) / Math.PI);
        return {
          mode: "angle",
          points: [v, a, b],
          value: deg,
          label: `angle ${deg.toFixed(2)}°${final ? "" : "…"}`,
        };
      }
      case "area": {
        if (points.length < 2) {
          return { mode: "area", points, value: 0, label: "Pick polygon vertices, Enter to close…" };
        }
        // Shoelace; implicitly closes back to points[0].
        let s = 0;
        for (let i = 0; i < points.length; i++) {
          const cur = points[i]!;
          const nxt = points[(i + 1) % points.length]!;
          s += cur[0] * nxt[1] - nxt[0] * cur[1];
        }
        const area = Math.abs(s) / 2;
        return {
          mode: "area",
          points: [...points],
          value: area,
          label: `area ${area.toFixed(3)}${final ? "" : " (Enter to commit)"}`,
        };
      }
      default: {
        const _exhaustive: never = this.mode;
        throw new Error(`MeasureTool: unknown mode ${String(_exhaustive)}`);
      }
    }
  }

  private setStep(): void {
    let prompt: string;
    let hints: string[];
    if (this.mode === "distance") {
      prompt = this.points.length === 0 ? "Pick first point (distance)" : "Pick second point";
      hints = ["Esc: end", "d/a/s: switch mode"];
    } else if (this.mode === "angle") {
      if (this.points.length === 0) prompt = "Pick vertex (angle)";
      else if (this.points.length === 1) prompt = "Pick first ray endpoint";
      else prompt = "Pick second ray endpoint";
      hints = ["Esc: end", "d/a/s: switch mode"];
    } else {
      prompt = `Pick polygon vertex (area) — ${this.points.length} placed`;
      hints = ["Enter: close + measure", "Esc: end", "d/a/s: switch mode"];
    }
    useCommandState.getState().setActive({
      name: this.name,
      label: "Measure",
      step: { prompt, hints },
    });
  }
}
