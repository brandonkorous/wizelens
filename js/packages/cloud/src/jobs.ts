import { evaluateAll } from "./alerts/evaluate.js";
import type { CloudApp } from "./app.js";
import { pruneAuthRows } from "./repo/auth-prune.js";
import { pruneServices } from "./repo/services.js";
import { sendDigests } from "./notify/digest.js";
import { checkHealth } from "./notify/health.js";
import { sendTeamNotices } from "./notify/team.js";

const HOUSEKEEPING_MS = 10 * 60_000;
const SETTLE_MS = 3_000;
/** A settle run this big means a backlog: settle again at once instead of waiting for the next tick. */
const SETTLE_BACKLOG = 1_000;
const ROLLUP_PRUNE_MS = 60_000;
const NOTICE_MS = 60_000;
const DIGEST_MS = 10 * 60_000;

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

/** Background work: retention, old services, stats, rollups, sessions, alert rules, team and health notices, and digests. Returns a function that stops it. */
export function startJobs(app: CloudApp): () => void {
  const now = app.config.now;
  const stops = [
    every("retention", HOUSEKEEPING_MS, () => app.telemetry.prune(now())),
    every("services", HOUSEKEEPING_MS, () => pruneServices(app.db, now())),
    every("settle", SETTLE_MS, async () => {
      while ((await app.telemetry.settle(now(), { defaultRetentionDays: app.config.retentionDays })) >= SETTLE_BACKLOG);
    }),
    every("rollups", ROLLUP_PRUNE_MS, () => app.telemetry.pruneRollups(now())),
    every("sessions", HOUSEKEEPING_MS, () => pruneAuthRows(app.db)),
    every("alerts", app.config.alertIntervalMs, () => evaluateAll(app)),
    every("team notices", NOTICE_MS, async () => {
      while ((await sendTeamNotices(app)) > 0);
    }),
    every("project health", HOUSEKEEPING_MS, () => checkHealth(app)),
    every("digests", DIGEST_MS, () => sendDigests(app)),
  ];
  return () => stops.forEach((stop) => stop());
}
