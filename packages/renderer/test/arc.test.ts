import { describe, it, expect } from "vitest";
import { arcSdf, buildArcInstances, ARC_INSTANCE_STRIDE } from "../src/pipelines/arc.js";
import type { ArcEntity, CircleEntity } from "@modcad/core";
import { asId } from "@modcad/core";

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

describe("arc pipeline", () => {
  it("arcSdf returns 0 on the arc and the radial distance off-arc", () => {
    expect(arcSdf(1, 0, 0, 0, 1, 0, Math.PI)).toBeCloseTo(0, 6);
    expect(arcSdf(0, 1, 0, 0, 1, 0, Math.PI)).toBeCloseTo(0, 6);
    expect(arcSdf(2, 0, 0, 0, 1, 0, Math.PI)).toBeCloseTo(1, 6);
  });

  it("arcSdf falls back to endpoint cap distance outside the sweep", () => {
    // Point at (1, -1) relative to a half-arc [0, π] should clamp to
    // the (1, 0) endpoint.
    const d = arcSdf(1, -1, 0, 0, 1, 0, Math.PI);
    expect(d).toBeCloseTo(1, 6);
  });

  it("buildArcInstances writes both arcs and circles", () => {
    const arcs: ArcEntity[] = [
      {
        id: asId("A1"), layerId: asId("L"), color: WHITE, lineweight: 1,
        kind: "arc", c: [0, 0], r: 5, startAngle: 0, endAngle: Math.PI,
      },
    ];
    const circles: CircleEntity[] = [
      {
        id: asId("C1"), layerId: asId("L"), color: "byLayer", lineweight: "byLayer",
        kind: "circle", c: [10, 0], r: 3,
      },
    ];
    const out = buildArcInstances(
      arcs,
      circles,
      () => 1,
      () => WHITE,
      () => 2,
    );
    expect(out.count).toBe(2);
    expect(out.instances.length).toBe(2 * ARC_INSTANCE_STRIDE);
    // circle stored second; sweep is 0..2π
    expect(out.instances[ARC_INSTANCE_STRIDE + 4]).toBe(0);
    expect(out.instances[ARC_INSTANCE_STRIDE + 5]).toBeCloseTo(Math.PI * 2, 6);
  });
});
