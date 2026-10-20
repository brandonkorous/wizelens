// Script-tag bundles: dist/wizelens.iife.js (window.WizeLens) and dist/wizelens.js (one ES module), lens-core included.
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    target: "es2020",
    lib: {
      entry: "src/script.ts",
      name: "WizeLens",
      formats: ["iife", "es"],
      fileName: (format) => (format === "iife" ? "wizelens.iife.js" : "wizelens.js"),
    },
  },
});
