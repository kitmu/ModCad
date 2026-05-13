// Active drawing route. Hosts the tab strip plus the canvas surface.
// Renderer mount and panel chrome wire in as their owning agents land.
import { useEffect } from "react";
import { TabStrip } from "../workspace/TabStrip.js";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";

export function Workspace() {
  const slices = useDrawingSession((s) => s.slices);
  const openNew = useDrawingSession((s) => s.openNew);

  // Phase 2 placeholder: ensure at least one drawing exists so the user
  // never lands on an empty workspace. The Boot route will do this
  // properly with file-open / restore-from-autosave once those land.
  useEffect(() => {
    if (slices.length === 0) openNew();
  }, [slices.length, openNew]);

  return (
    <div data-testid="workspace" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TabStrip />
      <main style={{ flex: 1, position: "relative" }}>
        <canvas
          id="modcad-canvas"
          data-testid="canvas"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </main>
    </div>
  );
}
