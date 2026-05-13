import { describe, it, expect } from "vitest";
import { SceneState } from "../src/SceneState.js";
import type { Entity } from "@modcad/core";
import { asId } from "@modcad/core";

const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const line = (id: string): Entity => ({
  id: asId(id), layerId: asId("L"), color: WHITE, lineweight: 1,
  kind: "line", a: [0, 0], b: [1, 1],
});

describe("SceneState", () => {
  it("inserts in stable order and removes", () => {
    const s = new SceneState();
    s.upsert([line("a"), line("b"), line("c")]);
    expect(s.entities().map((e) => e.id)).toEqual(["a", "b", "c"]);
    s.remove([asId("b")]);
    expect(s.entities().map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("upserts overwrite without duplicating order", () => {
    const s = new SceneState();
    s.upsert([line("a")]);
    s.upsert([line("a")]);
    expect(s.size).toBe(1);
    expect(s.entities()).toHaveLength(1);
  });

  it("tracks the dirty flag", () => {
    const s = new SceneState();
    s.upsert([line("a")]);
    expect(s.isDirty()).toBe(true);
    s.markClean();
    expect(s.isDirty()).toBe(false);
    s.remove([asId("a")]);
    expect(s.isDirty()).toBe(true);
  });
});
