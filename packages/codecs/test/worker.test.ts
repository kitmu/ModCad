// Worker wrapper smoke test. Under Node (no `Worker`) the wrapper
// transparently falls back to synchronous `readDxf`.
import { describe, it } from "vitest";
import { parseDxfInWorker } from "../src/dxf/worker.js";

const TRIVIAL_DXF = [
  "0", "SECTION", "2", "HEADER", "0", "ENDSEC",
  "0", "SECTION", "2", "TABLES",
  "0", "TABLE", "2", "LAYER", "70", "1",
  "0", "LAYER", "2", "0", "70", "0", "62", "7", "6", "CONTINUOUS", "370", "25",
  "0", "ENDTAB",
  "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "0",
  "10", "0.0", "20", "0.0", "30", "0.0",
  "11", "10.0", "21", "0.0", "31", "0.0",
  "0", "ENDSEC",
  "0", "EOF",
  "",
].join("\n");

describe("parseDxfInWorker", () => {
  it("parses DXF via synchronous fallback when Worker is unavailable", async () => {
    const result = await parseDxfInWorker(TRIVIAL_DXF);
    if (result.warnings.length !== 0) {
      throw new Error(`unexpected warnings: ${JSON.stringify(result.warnings)}`);
    }
    const kinds = result.drawing.entityOrder.map(
      (id) => result.drawing.entities[id]?.kind,
    );
    if (kinds.length !== 1 || kinds[0] !== "line") {
      throw new Error(`unexpected entities: ${JSON.stringify(kinds)}`);
    }
  });
});
