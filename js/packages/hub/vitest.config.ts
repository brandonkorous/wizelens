import { defineConfig } from "vitest/config";

// The stats tests build and compare whole SQLite files. On slow CI machines, or next to other packages' tests, that takes more than 5 s.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
