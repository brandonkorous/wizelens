import { evaluateAll } from "./alerts/evaluate.js";
import type { CloudApp } from "./app.js";
import { pruneByRetention, pruneMetricsByRetention } from "./repo/trace-write.js";
import { pruneRollups, settleCloud } from "./settle.js";
import { pruneAuthRows } from "./repo/auth-prune.js";

const HOUSEKEEPING_MS = 10 * 60_000;
const SETTLE_MS = 3_000;
const ROLLUP_PRUNE_MS = 60_000;

/** Run `job` now and then every `everyMs`. A failed run logs and waits for the next one. */
function every(name: string, everyMs: number, job: () => Promise<unknown>): () => void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    job()
      .catch((err: unknown) => console.error(`[wizelens-cloud] ${name} failed:`, err))
      .finally(() => (running = false));
  };
  const timer = setInterval(run, everyMs);
  const first = setTimeout(run, 1000);
  timer.unref();
  first.unref();
  return () => (clearInterval(timer), clearTimeout(first));
}

/** Background work: retention, settling stats, rollup aging, expired sessions and links, and alert rules. Returns a function that stops it. */
export function startJobs(app: CloudApp): () => void {
  const now = app.config.now;
  const stops = [
    every("retention", HOUSEKEEPING_MS, async () => {
      while ((await pruneByRetention(app.db, now())) > 0);
      await pruneMetricsByRetention(app.db, now());
      await pruneRollups(app.db, now(), true);
    }),
    every("settle", SETTLE_MS, () => settleCloud(app.db, now(), { defaultRetentionDays: app.config.retentionDays })),
    every("rollups", ROLLUP_PRUNE_MS, () => pruneRollups(app.db, now())),
    every("sessions", HOUSEKEEPING_MS, () => pruneAuthRows(app.db)),
    every("alerts", app.config.alertIntervalMs, () => evaluateAll(app)),
  ];
  return () => stops.forEach((stop) => stop());
}
