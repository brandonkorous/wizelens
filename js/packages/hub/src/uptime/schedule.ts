import { UPTIME_SERVICE, uptimeTelemetry } from "@wizeworks/lens-core/internal";
import type { HubData } from "../data.js";
import type { HubWrite } from "../store.js";
import { type RunOptions, runCheck } from "./run.js";
import { claimRun, dueChecks, type HubCheck, pruneIncidents, saveRun } from "./store.js";

/** The write a run makes: a trace of the wizelens-uptime service, in the check's project and environment. */
export function uptimeWrite(c: HubCheck, telemetry: Pick<HubWrite, "spans" | "logs">, runtime: string): HubWrite {
  const sender = { service: UPTIME_SERVICE, project: c.project || undefined, environment: c.env || undefined, runtime };
  return { sender, via: "uptime", ...telemetry, remotes: [] };
}

/** Run one check now: keep its result, and write it as a trace. */
export async function runHubCheck(data: HubData, c: HubCheck, o: RunOptions & { now: () => number }): Promise<void> {
  const r = await runCheck(c, o);
  saveRun(data.store.db, c, r);
  data.write(uptimeWrite(c, uptimeTelemetry(c, r), "wizelens-hub"));
}

/** Run every check that is due. Each run is claimed first, so a slow one is not started again by the next tick. */
export async function runDueChecks(data: HubData, o: RunOptions & { now: () => number }): Promise<number> {
  const db = data.store.db;
  const now = o.now();
  const due = dueChecks(db, now);
  for (const c of due) claimRun(db, c, now);
  await Promise.all(due.map((c) => runHubCheck(data, c, o).catch((err: unknown) => console.error(`[wizelens-hub] uptime check ${c.id} failed:`, err))));
  pruneIncidents(db, now);
  return due.length;
}
