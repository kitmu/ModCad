// Active drawing route. Hosts the tab strip, file menu, canvas surface,
// command-state panel, palette/binding overlays, and the right-side
// panel stack (layers, properties, drawing properties).
import { useEffect, useState } from "react";
import { TabStrip } from "../workspace/TabStrip.js";
import { useDrawingSession } from "../workspace/DrawingSessionStore.js";
import { CanvasHost } from "../canvas/CanvasHost.js";
import { FileMenu } from "../files/FileMenu.js";
import { CommandStatePanel } from "../command-state/CommandStatePanel.js";
import { CommandPalette } from "../palette/CommandPalette.js";
import { CommandLineBar } from "../palette/CommandLineBar.js";
import { BindingsReference } from "../palette/BindingsReference.js";
import { PaletteKeyboard } from "../palette/PaletteKeyboard.js";
import { AriaLive } from "../canvas/AriaLive.js";
import { LayerTree } from "../panels/LayerTree.js";
import { PropertiesPanel } from "../panels/PropertiesPanel.js";
import { DrawingProperties } from "../panels/DrawingProperties.js";
import { NotificationsToaster } from "../panels/NotificationsToaster.js";
import { installDevApi } from "../devApi.js";

export function Workspace() {
  const slices = useDrawingSession((s) => s.slices);
  const openNew = useDrawingSession((s) => s.openNew);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        <button
          data-testid="sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title="Toggle side panels"
        >
          {sidebarOpen ? "›" : "‹"}
        </button>
      </div>
      <main style={{ flex: 1, position: "relative", display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <canvas
            id="modcad-canvas"
            data-testid="canvas"
            style={{ width: "100%", height: "100%", display: "block" }}
          />
          <CanvasHost />
          <AriaLive />
        </div>
        {sidebarOpen && (
          <aside
            data-testid="sidebar"
            style={{
              width: 280,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            <LayerTree />
            <PropertiesPanel />
            <DrawingProperties />
          </aside>
        )}
      </main>
      <CommandStatePanel />
      <CommandLineBar />
      <CommandPalette />
      <BindingsReference />
      <PaletteKeyboard />
      <NotificationsToaster />
    </div>
  );
}
