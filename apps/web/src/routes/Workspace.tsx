// Active drawing route. Hosts the tab strip, file menu, canvas surface,
// and the command-state panel. The CanvasHost owns the renderer lifecycle
// and tool dispatch.
import { useEffect } from "react";
import { TabStrip } from "../workspace/TabStrip.js";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { CanvasHost } from "../canvas/CanvasHost.js";
import { FileMenu } from "../files/FileMenu.js";
import { CommandStatePanel } from "../command-state/CommandStatePanel.js";
import { installDevApi } from "../devApi.js";

export function Workspace() {
  const slices = useDrawingSession((s) => s.slices);
  const openNew = useDrawingSession((s) => s.openNew);

  // Ensure at least one drawing exists so the user never lands on empty.
  useEffect(() => {
    if (slices.length === 0) openNew();
  }, [slices.length, openNew]);

  // Mount the dev/test introspection API (T044 dev hook for Playwright).
  useEffect(() => {
    installDevApi();
  }, []);

  return (
    <div data-testid="workspace" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", gap: 8, padding: 4, alignItems: "center" }}>
        <FileMenu />
        <TabStrip />
      </div>
      <main style={{ flex: 1, position: "relative" }}>
        <canvas
          id="modcad-canvas"
          data-testid="canvas"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
        <CanvasHost />
      </main>
      <CommandStatePanel />
    </div>
  );
}
