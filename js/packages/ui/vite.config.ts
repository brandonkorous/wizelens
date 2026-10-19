import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Served under each add-on's base path, so URLs stay relative; `pnpm dev` proxies /api to a running service.
const target = process.env.WIZELENS_TARGET ?? "http://localhost:5200";
// One id per build: the page compares it with version.json to see that a new release is out.
const build = process.env.WIZELENS_BUILD ?? Date.now().toString(36);

const versionFile = (): Plugin => ({
  name: "wl-version",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build }) });
  },
});

export default defineConfig({
  base: "./",
  plugins: [react(), versionFile()],
  define: { __WL_BUILD__: JSON.stringify(build) },
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
