// Scale mode: telemetry in ClickHouse. Reads go through views with the Postgres names, so the shared SQL answers pages and searches.
import { alignNow, CH_DIALECT, metricAlertSteps, metricPageSteps, type MetricRows, runMetricAsync, searchSql, sqlExecutor, type SqlRunner, suggestSql } from "@wizeworks/lens-core";
import type { RetentionOf, TelemetryStore } from "../store.js";
import { checkFactsVersionCh, clearProjectCh, syncProjects } from "./admin.js";
import { type ChClient, chClient } from "./http.js";
import { MetricWriter } from "./metrics.js";
import { activeHours, counts, lastTraceMs, slowestEndpoints, traceEnvs } from "./queries.js";
import { SettleQueue } from "./queue.js";
import { findTraceIds, getTrace, joinedTrace, loadTraces } from "./read.js";
import { migrateClickHouse } from "./schema.js";
import { settleClickHouse } from "./settle.js";
import { RetentionCache } from "./util.js";
import { writeRaw } from "./write.js";

export interface ChStoreOptions {
  url: string;
  retentionOf: RetentionOf;
  defaultRetentionDays: number;
  /** The clock for recovery on start. */
  now: () => number;
  /** False leaves the TTLs out (tests on a fixed clock). Default true. */
  ttl?: boolean;
}

export const chRunner = (ch: ChClient): SqlRunner => ({ all: (sql, params) => ch.query<Record<string, unknown>>(sql, params) });

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
  return chTelemetry(ch, queue, new RetentionCache(o.retentionOf, o.defaultRetentionDays), o.retentionOf);
}

function chTelemetry(ch: ChClient, queue: SettleQueue, retention: RetentionCache, retentionOf: RetentionOf): TelemetryStore {
  const src = (projectId: string) => ({ d: CH_DIALECT, run: chRunner(ch), scope: { project: projectId } });
  const metrics = new MetricWriter(ch);
  const runMetric = (s: { sql: string; args: unknown[] }) => ch.query(s.sql, s.args) as Promise<MetricRows>;
  return {
    kind: "clickhouse",
    async write(projectId, w, now) {
      const retentionMs = await retention.msOf(projectId);
      await writeRaw(ch, queue, projectId, w, now, retentionMs);
      await metrics.write(projectId, w.sender.environment ?? "", w.metrics ?? [], now, retentionMs);
    },
    traces: async (t) => loadTraces(ch, [t.projectId], await findTraceIds(ch, t, Date.now())),
    trace: (projectId, traceId) => getTrace(ch, [projectId], traceId),
    joinedTrace: (primaryId, scope, traceId) => joinedTrace(ch, primaryId, scope, traceId),
    counts: (projectId) => counts(ch, projectId),
    traceEnvs: (projectId) => traceEnvs(ch, projectId),
    activeHours: (projectId, from, to) => activeHours(ch, projectId, from, to),
    lastTraceMs: () => lastTraceMs(ch, Date.now()),
    executor: (projectId, retentionMs, env) =>
      sqlExecutor({ ...src(projectId), scope: { project: projectId, env }, retentionMs, loadTrace: (id) => getTrace(ch, [projectId], id).then((t) => t ?? null) }),
    settling: async (projectId, env) => queue.count(projectId, env) || null,
    search: (projectId, q) => searchSql(src(projectId), q),
    suggest: (projectId, r) => suggestSql(src(projectId), r),
    slowestEndpoints: (projectId, w, minCount, limit) => slowestEndpoints(ch, projectId, w, minCount, limit),
    metricData: (m, range, params, now) => runMetricAsync(metricPageSteps("ch", { project: m.projectId, env: m.env }, range, alignNow(now), params), runMetric),
    metricAlertData: (m, name, w, now) => runMetricAsync(metricAlertSteps("ch", { project: m.projectId, env: m.env, service: m.service }, name, w, now), runMetric),
    settle: (now, o) => settleClickHouse(ch, queue, retention, now, o),
    prune: (now) => syncProjects(ch, queue, retentionOf, now),
    pruneRollups: async () => undefined,
    checkFactsVersion: () => checkFactsVersionCh(ch, queue),
    clearProject: (projectId) => clearProjectCh(ch, queue, projectId),
    close: async () => undefined,
  };
}
