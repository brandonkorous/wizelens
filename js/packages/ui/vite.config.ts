import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served under each add-on's base path, so URLs stay relative; `pnpm dev` proxies /api to a running service.
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
