/* eslint-disable formatjs/no-literal-string-in-jsx -- T046b sweep pending: messages registered in en.json will replace literals here in v1.1. */
// T119 — Status bar with the opt-in FPS / draw-call overlay toggle.
//
// Renders at the bottom of the workspace. Always shows the current
// active command (or "ready"); the perf overlay is conditional on
// the user preference (persisted in IDB; see perfOverlayPref.ts).
//
// The toggle button is keyboard-accessible and ships an aria label
// so screen readers describe its effect.
import { useEffect, useState } from "react";
import {
  usePerfOverlayPref,
  hydratePerfOverlayPref,
} from "./perfOverlayPref.js";
import { useCommandState } from "../state/commandState.js";

// Sampling cadence for the perf readout. 250 ms keeps the DOM update
// rate cheap while still feeling responsive.
const SAMPLE_INTERVAL_MS = 250;

interface PerfSample {
  fps: number;
  drawCalls: number;
  entityCount: number;
}

function readFrameStats(): PerfSample | null {
  // The renderer exposes its FrameStats via `window.__modcad` (devApi)
  // — but only when the host has wired it. We probe lazily so the
  // status bar is decoupled from the renderer's lifecycle.
  if (typeof window === "undefined") return null;
  const dev = (window as unknown as { __modcadFrameStats?: () => PerfSample })
    .__modcadFrameStats;
  return dev ? dev() : null;
}

export function StatusBar(): JSX.Element {
  const overlay = usePerfOverlayPref();
  const activeCommand = useCommandState((s) => s.active?.name ?? null);
  const [sample, setSample] = useState<PerfSample | null>(null);

  useEffect(() => {
    void hydratePerfOverlayPref();
  }, []);

  useEffect(() => {
    if (!overlay.enabled) {
      setSample(null);
      return;
    }
    let cancelled = false;
    const tick = (): void => {
      if (cancelled) return;
      setSample(readFrameStats());
    };
    tick();
    const id = setInterval(tick, SAMPLE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [overlay.enabled]);

  return (
    <div
      data-testid="status-bar"
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "2px 8px",
        fontSize: 12,
        borderTop: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <span data-testid="status-bar-command">
        {activeCommand ? `cmd: ${activeCommand}` : "ready"}
      </span>
      {overlay.enabled && sample && (
        <span data-testid="status-bar-perf" style={{ fontVariantNumeric: "tabular-nums" }}>
          {`${Math.round(sample.fps)} fps · ${sample.drawCalls} draws · ${sample.entityCount} entities`}
        </span>
      )}
      <button
        type="button"
        data-testid="status-bar-perf-toggle"
        aria-pressed={overlay.enabled}
        aria-label={overlay.enabled ? "Hide perf overlay" : "Show perf overlay"}
        onClick={() => overlay.toggle()}
        style={{
          fontSize: 11,
          padding: "1px 6px",
          opacity: overlay.enabled ? 1 : 0.6,
        }}
      >
        {overlay.enabled ? "perf: on" : "perf: off"}
      </button>
    </div>
  );
}
