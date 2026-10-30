import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { wizeLensSourceMaps } from "@wizeworks/lens-cli/vite";

const gateway = process.env.GATEWAY_URL ?? "http://localhost:5100";

export default defineConfig({
  // Hidden source maps in builds, uploaded to the hub or cloud named by WIZELENS_ENDPOINT.
  plugins: [react(), wizeLensSourceMaps({ upload: !!process.env.WIZELENS_ENDPOINT })],
  server: {
    port: 5173,
    strictPort: true,
    // Same origin for the browser: the app, the API, and WizeLens all live on :5173.
    proxy: {
      "/api": { target: gateway },
      "/_wizelens": { target: gateway },
    },
  },
});
