import { describe, it, expect } from "vitest";
import { PickIndex, cpuPick, hashId } from "../src/picking.js";
import { asId } from "@modcad/core";
import type { Entity } from "@modcad/core";

describe("picking", () => {
  it("hashId is deterministic and nonzero", () => {
    expect(hashId("abc")).toBe(hashId("abc"));
    expect(hashId("")).not.toBe(0);
  });

  it("PickIndex round-trips hash <-> id via the pixel encoding", () => {
    const idx = new PickIndex();
    const id = asId("01HZX");
    const h = idx.register(id);
    const [r, g, b, a] = PickIndex.encodeHash(h);
    const decoded = PickIndex.decodePixel(new Uint8Array([r, g, b, a]));
    expect(idx.resolve(decoded)).toBe(id);
  });

  it("cpuPick hits the closest line within tolerance", () => {
    const entities: Entity[] = [
      {
        id: asId("L1"), layerId: asId("L"),
        color: { r: 1, g: 1, b: 1, a: 1 }, lineweight: 1, kind: "line",
        a: [0, 0], b: [10, 0],
      },
      {
        id: asId("L2"), layerId: asId("L"),
        color: { r: 1, g: 1, b: 1, a: 1 }, lineweight: 1, kind: "line",
        a: [0, 5], b: [10, 5],
      },
    ];
    expect(cpuPick(entities, 5, 0.1, 0.5)).toBe(asId("L1"));
    expect(cpuPick(entities, 5, 5.05, 0.5)).toBe(asId("L2"));
    expect(cpuPick(entities, 5, 2.5, 0.1)).toBeNull();
  });
});
