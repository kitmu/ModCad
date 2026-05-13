import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";

// Phase 2 boot route lands here. For now, a minimal mount so the dev
// server has something to render and Playwright has a target.
function Boot() {
  return (
    <div id="boot" style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>ModCad</h1>
      <p data-testid="phase">Phase 1 scaffold</p>
    </div>
  );
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<Boot />);
