import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// T126: when MODCAD_BUNDLE_REPORT=1, write a treemap to
// dist/bundle-stats.html. The flag is off by default to keep regular
// builds fast; CI enables it before running check-bundle.mjs.
const wantReport = process.env["MODCAD_BUNDLE_REPORT"] === "1";

export default defineConfig({
  plugins: [
    react(),
    ...(wantReport
      ? [
          visualizer({
            filename: "dist/bundle-stats.html",
            template: "treemap",
            gzipSize: true,
            brotliSize: false,
          }),
        ]
      : []),
  ],
  server: { port: 5173, strictPort: true },
  build: { target: "es2022", sourcemap: true },
});
