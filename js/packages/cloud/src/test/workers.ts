// Settle worker threads on the TypeScript sources, for tests.
import type { SettlePoolOptions } from "../telemetry/ch/settle-pool.js";

export const TS_WORKER: Pick<SettlePoolOptions, "entry" | "execArgv"> = {
  entry: new URL("../telemetry/ch/settle-worker.ts", import.meta.url),
  execArgv: ["--experimental-transform-types", "--no-warnings", "--import", new URL("./ts-worker.mjs", import.meta.url).href],
};
