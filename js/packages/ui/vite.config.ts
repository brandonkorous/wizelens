import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dashboard is served by each add-on under its base path (default /_wizelens/),
// so every URL must be relative. In `pnpm dev`, /api is proxied to a running service.
const target = process.env.WIZELENS_TARGET ?? "http://localhost:5200";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5180,
    proxy: {
      "/api": { target, rewrite: (path) => `/_wizelens${path}` },
    },
  },
});
