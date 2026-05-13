// Unit tests for the palette fuzzy ranker (T063).
//
// These pin the behavioural contract the spec acceptance scenarios
// for US2 rely on:
//   - exact prefix wins
//   - subsequence still works
//   - "rec" surfaces draw.rectangle ABOVE edit.redo (the AutoCAD
//     alias must out-rank an unrelated name that also subseq-matches)
//   - tied scores fall back to alphabetical name order
import { describe, it, expect } from "vitest";
import { rank, type PaletteCandidate } from "../src/Palette/rank.js";

const SAMPLE: PaletteCandidate[] = [
  { name: "draw.line", summary: "", aliases: ["L", "LINE"], binding: "L" },
  {
    name: "draw.rectangle",
    summary: "",
    aliases: ["REC", "RECTANGLE", "R"],
    binding: "REC",
  },
  { name: "draw.polyline", summary: "", aliases: ["PL", "POLYLINE"], binding: "P" },
  { name: "draw.circle", summary: "", aliases: ["C", "CIRCLE"], binding: "C" },
  { name: "edit.undo", summary: "", aliases: ["U", "UNDO"] },
  { name: "edit.redo", summary: "", aliases: ["REDO"] },
  { name: "file.new", summary: "", aliases: ["NEW"] },
];

describe("palette rank", () => {
  it("returns no results for an empty query but lists everything alphabetically", () => {
    const r = rank("", SAMPLE);
    expect(r.map((x) => x.name)).toEqual([
      "draw.circle",
      "draw.line",
      "draw.polyline",
      "draw.rectangle",
      "edit.redo",
      "edit.undo",
      "file.new",
    ]);
  });

  it("ranks an exact alias as the top hit", () => {
    const r = rank("L", SAMPLE);
    expect(r[0]?.name).toBe("draw.line");
  });

  it("treats a prefix as a strong match", () => {
    const r = rank("draw", SAMPLE);
    const names = r.map((x) => x.name);
    expect(names.slice(0, 4).sort()).toEqual([
      "draw.circle",
      "draw.line",
      "draw.polyline",
      "draw.rectangle",
    ]);
    // None of the non-draw commands rank.
    for (const name of names) expect(name.startsWith("draw.")).toBe(true);
  });

  it("surfaces draw.rectangle above edit.redo for query 'rec'", () => {
    const r = rank("rec", SAMPLE);
    const idxRect = r.findIndex((x) => x.name === "draw.rectangle");
    const idxRedo = r.findIndex((x) => x.name === "edit.redo");
    expect(idxRect).toBeGreaterThanOrEqual(0);
    expect(idxRect).toBeLessThan(idxRedo === -1 ? Number.POSITIVE_INFINITY : idxRedo);
  });

  it("surfaces the rectangle command for the alias 'REC'", () => {
    const r = rank("REC", SAMPLE);
    expect(r[0]?.name).toBe("draw.rectangle");
    expect(r[0]?.matchedAlias).toBe("REC");
  });

  it("handles subsequence matches when no prefix or substring fits", () => {
    // "drcl" should still match draw.circle by skipping characters.
    const r = rank("drcl", SAMPLE);
    expect(r[0]?.name).toBe("draw.circle");
  });

  it("returns match spans pointing at the contiguous prefix range", () => {
    const r = rank("draw", SAMPLE);
    const line = r.find((x) => x.name === "draw.line");
    expect(line?.matchSpans).toEqual([[0, 4]]);
  });

  it("breaks ties alphabetically by command name", () => {
    // Both edit.undo (aliased U) and draw.polyline (no U alias) are
    // candidates for 'u' — undo wins on score, but two alias-only
    // matches with the same shape should tie-break on name.
    const tied: PaletteCandidate[] = [
      { name: "draw.zeta", summary: "", aliases: ["Z"] },
      { name: "draw.alpha", summary: "", aliases: ["Z"] },
    ];
    const r = rank("Z", tied);
    expect(r.map((x) => x.name)).toEqual(["draw.alpha", "draw.zeta"]);
  });
});
