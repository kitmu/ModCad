// Unit tests for the fat-line pipeline's pure-math layer. Backend-agnostic.
import { describe, it, expect } from "vitest";
import {
  FAT_LINE_INSTANCE_STRIDE,
  buildLineInstances,
  miterOffset,
  writeLineInstance,
} from "../src/pipelines/fatLine.js";
import type { LineEntity } from "@modcad/core";
import { asId } from "@modcad/core";

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

describe("fatLine", () => {
  it("emits one instance per line", () => {
    const lines: LineEntity[] = [
      { id: asId("a"), layerId: asId("L"), color: WHITE, lineweight: 2, kind: "line", a: [0, 0], b: [10, 0] },
      { id: asId("b"), layerId: asId("L"), color: "byLayer", lineweight: "byLayer", kind: "line", a: [0, 0], b: [0, 10] },
    ];
    const out = buildLineInstances(
      lines,
      (id) => (id === "a" ? 0xdead : 0xbeef),
      () => WHITE,
      () => 3,
    );
    expect(out.count).toBe(2);
    expect(out.instances.length).toBe(2 * FAT_LINE_INSTANCE_STRIDE);
    // First instance pickHash slot.
    expect(out.instances[15]).toBe(0xdead);
    // Second instance uses byLayer width = 3.
    expect(out.instances[FAT_LINE_INSTANCE_STRIDE + 12]).toBe(3);
  });

  it("writeLineInstance throws when buffer too small", () => {
    const buf = new Float32Array(4);
    expect(() =>
      writeLineInstance(buf, 0, {
        ax: 0, ay: 0, bx: 1, by: 1,
        prevX: 0, prevY: 0, nextX: 1, nextY: 1,
        width: 1, color: WHITE, dashLen: 0, gapLen: 0, pickHash: 1,
      }),
    ).toThrow();
  });

  it("miterOffset bevels on a 180-degree reversal", () => {
    // prev going +x, next going -x → 180° flip → degenerate.
    const m = miterOffset(1, 0, -1, 0, 4);
    expect(m).toBeNull();
  });

  it("miterOffset returns a finite offset on a 90-degree corner within limit", () => {
    // prev going +x, next going +y → 90°.
    const m = miterOffset(1, 0, 0, 1, 4);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(Number.isFinite(m.x)).toBe(true);
    expect(Number.isFinite(m.y)).toBe(true);
  });

  it("miterOffset returns null when miter would exceed the limit", () => {
    // Sharp turn — direction change of ~170° (interior angle ~10°).
    // miter length = 1/sin(5°) ≈ 11.47 exceeds the default limit of 4.
    const turn = (170 * Math.PI) / 180;
    const nx = Math.cos(turn);
    const ny = Math.sin(turn);
    const m = miterOffset(1, 0, nx, ny, 4);
    expect(m).toBeNull();
  });
});
