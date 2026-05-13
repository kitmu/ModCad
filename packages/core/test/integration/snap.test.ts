// T028 — SnapEngine integration: precedence ladder, predictive boost,
// Tab cycle, soft-vs-hard guard.
import { describe, it, expect } from "vitest";
import { SnapEngine } from "../../src/snap/SnapEngine.js";
import { asId } from "../../src/ids.js";
import type {
  Entity,
  LineEntity,
  SnapMode,
} from "../../src/scene/types.js";

const LAYER = asId("layer-0");
const baseLine = (id: string, a: [number, number], b: [number, number]): LineEntity => ({
  id: asId(id),
  layerId: LAYER,
  color: "byLayer",
  lineweight: "byLayer",
  kind: "line",
  a,
  b,
});

const ALL_MODES: SnapMode[] = [
  "endpoint",
  "midpoint",
  "center",
  "node",
  "intersection",
  "perpendicular",
  "tangent",
  "nearest",
  "parallel",
  "grid",
];

describe("SnapEngine precedence (FR-008a)", () => {
  it("endpoint beats midpoint when both are within radius", () => {
    // Line A has its endpoint at (0,0). Line B has its midpoint at (1,0).
    // Cursor at (0.4, 0.05) is within radius of both.
    const lineA = baseLine("a", [0, 0], [10, 0]);
    const lineB = baseLine("b", [0, 0.5], [2, 0.5]); // midpoint at (1, 0.5)
    const entities: Entity[] = [lineA, lineB];
    const engine = new SnapEngine(
      () => entities,
      { radiusPx: 20, softModes: new Set() },
    );
    const hit = engine.query(
      [0.4, 0.05],
      new Set<SnapMode>(["endpoint", "midpoint"]),
      1, // 1 world unit = 1 px for simplicity
    );
    expect(hit).not.toBeNull();
    expect(hit!.mode).toBe("endpoint");
  });

  it("Tab cycles to the next in-range candidate then returns null", () => {
    const lineA = baseLine("a", [0, 0], [10, 0]);
    const lineB = baseLine("b", [0, 0.5], [2, 0.5]);
    const engine = new SnapEngine(
      () => [lineA, lineB],
      { radiusPx: 20, softModes: new Set() },
    );
    const first = engine.query(
      [0.4, 0.05],
      new Set<SnapMode>(["endpoint", "midpoint"]),
      1,
    );
    expect(first?.mode).toBe("endpoint");
    const second = engine.next();
    expect(second).not.toBeNull();
    // After all candidates, next() eventually returns null.
    let last: ReturnType<typeof engine.next> = second;
    let guard = 0;
    while (last !== null && guard < 100) {
      last = engine.next();
      guard += 1;
    }
    expect(last).toBeNull();
  });
});

describe("SnapEngine predictive mode (FR-007)", () => {
  it("perpendicular outranks endpoint when motion points at the foot", () => {
    // A vertical line x=5 from y=-10..10. Cursor at (0, 0) moving in
    // +x direction. Perpendicular foot is (5, 0). Endpoint (5, -10) is
    // further; without predictive boost the perpendicular at distance 5
    // would still rank below endpoint at distance ~11.18 only by ladder
    // order (endpoint=0 vs perp=4). Predictive boost should flip it.
    const vline = baseLine("v", [5, -10], [5, 10]);
    const engine = new SnapEngine(
      () => [vline],
      { radiusPx: 50, softModes: new Set() },
    );
    const hit = engine.query(
      [0, 0],
      new Set<SnapMode>(["endpoint", "perpendicular"]),
      1,
      [1, 0],
    );
    expect(hit).not.toBeNull();
    expect(hit!.mode).toBe("perpendicular");
  });
});

describe("SnapEngine soft vs hard (FR-008b)", () => {
  it("parallel never out-ranks an endpoint hard snap", () => {
    // Line with endpoint near the cursor; another line whose parallel
    // extension passes even closer. The hard endpoint must still win.
    const lineA = baseLine("a", [0, 0], [10, 0]); // endpoint at (0,0)
    const lineB = baseLine("b", [-5, 1], [5, 1]); // horizontal; parallel anchor at (-5,1) or (5,1)
    const engine = new SnapEngine(
      () => [lineA, lineB],
      { radiusPx: 50, softModes: new Set(["parallel"]) },
    );
    const hit = engine.query(
      [0.2, 0.05],
      new Set<SnapMode>(["endpoint", "parallel"]),
      1,
    );
    expect(hit).not.toBeNull();
    expect(hit!.mode).toBe("endpoint");
    expect(hit!.strength).toBe("hard");
  });
});

describe("SnapEngine returns null outside radius", () => {
  it("no candidates → null", () => {
    const engine = new SnapEngine(
      () => [],
      { radiusPx: 10, softModes: new Set() },
    );
    expect(engine.query([0, 0], new Set<SnapMode>(ALL_MODES), 1)).toBeNull();
  });
});
