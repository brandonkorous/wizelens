// Scale mode: telemetry in ClickHouse. Reads go through views with the Postgres names, so the shared SQL answers pages and searches.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProjectSettings } from "@wizeworks/lens-core/internal";
import type { OrgOf, RetentionOf, TelemetryStore } from "../store.js";
import { checkFactsVersionCh, clearProjectCh, stampOrgs, syncProjects } from "./admin.js";
import { type ChClient, chClient } from "./http.js";
import { MetricWriter } from "./metrics.js";
import { lastTraceMs } from "./queries.js";
import { SettleQueue } from "./queue.js";
import { Rebuild } from "./rebuild.js";
import { ensureReader, type Reader, readerClient, readerOf } from "./reader.js";
import { migrateClickHouse } from "./schema.js";
import { settleClickHouse, type Settler } from "./settle.js";
import { SettlePool, type SettlePoolOptions } from "./settle-pool.js";
import { settleProject } from "./settle-work.js";
import { chReads } from "./store-reads.js";
import { OrgCache, RetentionCache } from "./util.js";
import { writeRaw } from "./write.js";

export interface ChStoreOptions {
  url: string;
  retentionOf: RetentionOf;
  /** Each project's organization, written on every row. */
  orgOf: OrgOf;
  /** Log retention days per project; the trace retention when absent. */
  logRetentionOf?: RetentionOf;
  /** A project's own settings, for the thresholds its traces settle with. */
  settingsOf?: (projectId: string) => Promise<ProjectSettings>;
  defaultRetentionDays: number;
  /** The clock for recovery on start. */
  now: () => number;
  /** False leaves the TTLs out (tests on a fixed clock). Default true. */
  ttl?: boolean;
  /** Worker threads for settle. Default 0: settle in this thread. */
  settleWorkers?: number;
  /** For tests: traces per page of a stats rebuild. */
  rebuildPage?: number;
  /** For tests: the worker file and its Node flags. */
  worker?: Pick<SettlePoolOptions, "entry" | "execArgv">;
}

const DEPTH = 3;
const DEFAULT_WORKER = new URL("./settle-worker.js", import.meta.url);

/** Settle in worker threads when there are any and the worker file is built (it is not when tests run the sources), else here. */
function settlerOf(ch: ChClient, o: ChStoreOptions, queue: SettleQueue, rebuild: Rebuild): { settler: Settler; pool: SettlePool | null; rebuild: Rebuild } {
  const refill = () => rebuild.refill();
  const retention = new RetentionCache(o.retentionOf, o.defaultRetentionDays);
  const logRetention = new RetentionCache(o.logRetentionOf ?? o.retentionOf, o.defaultRetentionDays);
  const entry = o.worker?.entry ?? DEFAULT_WORKER;
  const size = existsSync(fileURLToPath(entry)) ? Math.max(0, o.settleWorkers ?? 0) : 0;
  const settingsOf = o.settingsOf;
  const orgs = new OrgCache(o.orgOf);
  if (!size) return { settler: { queue, retention, logRetention, orgs, settingsOf, run: (t) => settleProject(ch, t), depth: DEPTH, refill }, pool: null, rebuild };
  const pool = new SettlePool({ url: o.url, size, ...o.worker });
  return { settler: { queue, retention, logRetention, orgs, settingsOf, run: pool.run, depth: Math.max(DEPTH, size * 2), refill }, pool, rebuild };
}

/** What the store's upkeep needs besides the client: retention, organizations, and the reader for scoped reads. */
interface Upkeep {
  days: RetentionOf;
  logDays: RetentionOf;
  orgOf: OrgOf;
  reader: Reader;
}

/** ClickHouse may still be starting (a deploy starts both at once): wait up to two minutes. */
async function waitReady(ch: ChClient): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await ch.ping()) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("ClickHouse did not answer /ping for two minutes. Check --clickhouse and that the server runs.");
}

/** Create the schema, rebuild the settle queue, and return the store. */
export async function openClickHouse(o: ChStoreOptions): Promise<TelemetryStore> {
  const ch = chClient({ url: o.url });
  await waitReady(ch);
  await migrateClickHouse(o.url, ch, { ttl: o.ttl });
  const queue = new SettleQueue();
  await queue.recover(ch, o.now());
  const rebuild = await Rebuild.open(ch, queue, o.rebuildPage);
  await stampOrgs(ch, o.orgOf);
  const reader = readerOf(o.url);
  await ensureReader(ch, reader);
  return chTelemetry(ch, settlerOf(ch, o, queue, rebuild), { days: o.retentionOf, logDays: o.logRetentionOf ?? o.retentionOf, orgOf: o.orgOf, reader });
}

function chTelemetry(ch: ChClient, { settler, pool, rebuild }: ReturnType<typeof settlerOf>, upkeep: Upkeep): TelemetryStore {
  const { queue, retention, logRetention, orgs } = settler;
  const metrics = new MetricWriter(ch);
  // One settle at a time: the queue hands each trace to one run, so a second call waits for the first rather than return before its traces are written.
  let settled: Promise<unknown> = Promise.resolve();
  return {
    kind: "clickhouse",
    ...chReads((org) => readerClient(upkeep.reader, org), queue),
    async write(projectId, w, now) {
      const retentionMs = await retention.msOf(projectId);
      const project = { id: projectId, org: await orgs.one(projectId) };
      await writeRaw(ch, queue, project, w, now, { ms: retentionMs, logMs: await logRetention.msOf(projectId) });
      await metrics.write(project, w.sender.environment ?? "", w.metrics ?? [], now, retentionMs);
    },
    lastTraceMs: () => lastTraceMs(ch, Date.now()),
    settle(now, o) {
      const run = settled.then(() => settleClickHouse(settler, now, o));
      settled = run.catch(() => undefined);
      return run;
    },
    prune: async (now) => {
      await syncProjects(ch, queue, upkeep, now);
      await stampOrgs(ch, upkeep.orgOf);
    },
    pruneRollups: async () => undefined,
    checkFactsVersion: () => checkFactsVersionCh(ch, rebuild),
    clearProject: (projectId) => clearProjectCh(ch, queue, projectId),
    close: async () => pool?.close(),
  };
}
