import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UPTIME_SERVICE, uptimeTelemetry } from "@wizeworks/lens-core";
import { type HubWrite, isPrivateAddress, runCheck } from "@wizeworks/lens-hub/kit";
import type { CloudApp } from "../app.js";
import { writeService } from "../repo/trace-write.js";
import { claimDue, type CloudCheck, saveRun } from "../repo/uptime.js";

const BATCH = 100;
const PARALLEL = 10;

/** A check may not point into the cloud's own network (metadata, databases), the same rule as alert webhooks. Self-hosts can allow it. */
export async function checkUrlProblem(url: string, allowPrivate: boolean): Promise<string | null> {
  if (allowPrivate) return null;
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) return "The host name does not resolve.";
  return addresses.some(isPrivateAddress) ? "Checks cannot point at private or local addresses." : null;
}

/** Run one check now: keep its result, and write it as a wizelens-uptime trace through the normal write path. */
export async function runCloudCheck(app: CloudApp, c: CloudCheck): Promise<void> {
  const r = await runCheck(c, { allowPrivate: app.config.allowPrivateTargets, now: app.config.now });
  await saveRun(app.db, c, r);
  const sender = { service: UPTIME_SERVICE, environment: c.env || undefined, runtime: `wizelens-cloud ${app.version}` };
  const w: HubWrite = { sender, via: "uptime", ...uptimeTelemetry(c, r), remotes: [] };
  const now = app.config.now();
  await writeService(app.db, c.projectId, w, now);
  await app.telemetry.write(c.projectId, w, now);
}

/** Run every due check, ten at a time. Claiming moves each check's next run first, so replicas and slow runs never double up. */
export async function runUptime(app: CloudApp): Promise<number> {
  const due = await claimDue(app.db, app.secrets, app.config.now(), BATCH);
  const queue = [...due];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) await runCloudCheck(app, c).catch((err: unknown) => console.error(`[wizelens-cloud] uptime check ${c!.id} failed:`, err));
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, due.length) }, worker));
  return due.length;
}
