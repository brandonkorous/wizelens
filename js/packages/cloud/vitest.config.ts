import { defineConfig } from "vitest/config";

// Each test starts Postgres in-process (PGlite). That takes a few seconds on slow CI machines.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
