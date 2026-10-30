import { evaluateAll } from "./alerts/evaluate.js";
import type { CloudApp } from "./app.js";
import { sendUsageNotices } from "./billing/notices.js";
import { recheckSso } from "./auth/sso-recheck.js";
import { pruneAuthRows } from "./repo/auth-prune.js";
import { pruneAlertValues } from "./repo/alert-events.js";
import { pruneServiceMinutes } from "./repo/service-minutes.js";
import { pruneServices } from "./repo/services.js";
import { sendDigests } from "./notify/digest.js";
import { checkHealth } from "./notify/health.js";
import { sendTeamNotices } from "./notify/team.js";
import { pruneIncidents } from "./repo/uptime.js";
import { runUptime } from "./uptime/run.js";
import { checkPackages } from "@wizeworks/lens-hub/internal";
import { pgPackages } from "./repo/packages.js";

const HOUSEKEEPING_MS = 10 * 60_000;
const SETTLE_MS = 3_000;
/** A settle run this big means a backlog: settle again at once instead of waiting for the next tick. */
const SETTLE_BACKLOG = 1_000;
const ROLLUP_PRUNE_MS = 60_000;
const NOTICE_MS = 60_000;
const DIGEST_MS = 10 * 60_000;
const UPTIME_MS = 15_000;
const USAGE_MS = 60_000;
const REPORT_MS = 10 * 60_000;
const PACKAGES_MS = 5 * 60_000;
/** How often single sign-on people are checked with their identity provider: a leaver loses access within this time. */
const SSO_RECHECK_MS = 5 * 60_000;

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

/** Background work: retention, old services, stats, rollups, sessions, single sign-on checks, alert rules, team and health notices, digests, uptime checks, usage, and the Stripe meter. Returns a function that stops it. */
export function startJobs(app: CloudApp): () => void {
  const now = app.config.now;
  const stops = [
    every("retention", HOUSEKEEPING_MS, () => app.telemetry.prune(now())),
    every("services", HOUSEKEEPING_MS, () => pruneServices(app.db, now())),
    every("service minutes", HOUSEKEEPING_MS, () => pruneServiceMinutes(app.db, now())),
    every("settle", SETTLE_MS, async () => {
      const defaultFacts = { slowQueryMs: app.config.slowQueryMs, nPlusOneThreshold: app.config.nPlusOneThreshold };
      const o = { defaultRetentionDays: app.config.retentionDays, defaultFacts, onSettled: (p: string) => app.changes.emit(p) };
      while ((await app.telemetry.settle(now(), o)) >= SETTLE_BACKLOG);
    }),
    every("rollups", ROLLUP_PRUNE_MS, () => app.telemetry.pruneRollups(now())),
    every("sessions", HOUSEKEEPING_MS, () => pruneAuthRows(app.db)),
    every("single sign-on", SSO_RECHECK_MS, () => recheckSso(app)),
    every("alerts", app.config.alertIntervalMs, () => evaluateAll(app)),
    every("alert values", HOUSEKEEPING_MS, () => pruneAlertValues(app.db, now())),
    every("team notices", NOTICE_MS, async () => {
      while ((await sendTeamNotices(app)) > 0);
    }),
    every("project health", HOUSEKEEPING_MS, () => checkHealth(app)),
    every("digests", DIGEST_MS, () => sendDigests(app)),
    every("uptime", UPTIME_MS, () => runUptime(app)),
    every("uptime incidents", HOUSEKEEPING_MS, () => pruneIncidents(app.db, now())),
    every("usage", USAGE_MS, async () => (await app.billing.usage.flush(), await sendUsageNotices(app))),
    ...(app.billing.report ? [every("billing report", REPORT_MS, app.billing.report)] : []),
    ...(app.config.osv ? [every("packages", PACKAGES_MS, () => checkPackages(pgPackages(app.db), app.config.fetch, now(), app.config.osvUrl))] : []),
  ];
  return () => stops.forEach((stop) => stop());
}
