// Scoped reads on ClickHouse: each goes as the reader user for its scope's organization, so row policies hold it there too.
import { alignNow, CH_DIALECT, infraSteps, metricAlertSteps, metricPageSteps, type MetricRows, runMetricAsync, searchSql, sqlExecutor, type SqlRunner } from "@wizeworks/lens-core";
import { metricScope, sqlScope, type TelemetryStore, type TenantScope } from "../store.js";
import type { ChClient } from "./http.js";
import { activeHours, counts, slowestEndpoints, traceEnvs } from "./queries.js";
import type { SettleQueue } from "./queue.js";
import { findTraceIds, getTrace, joinedTrace, loadTraces } from "./read.js";
import { suggestCh } from "./suggest.js";

export const chRunner = (ch: ChClient): SqlRunner => ({ all: (sql, params) => ch.query<Record<string, unknown>>(sql, params) });

type Reads = Pick<
  TelemetryStore,
  "traces" | "trace" | "joinedTrace" | "counts" | "traceEnvs" | "activeHours" | "executor" | "settling" | "search" | "suggest" | "slowestEndpoints" | "metricData" | "metricAlertData" | "infraData"
>;

/** Every scoped read; `as(org)` is the reader client for one organization. */
export function chReads(as: (org: string) => ChClient, queue: SettleQueue): Reads {
  const read = (s: TenantScope) => as(s.org);
  const src = (s: TenantScope, env?: string) => ({ d: CH_DIALECT, run: chRunner(read(s)), scope: sqlScope(s, env) });
  const runMetric = (s: TenantScope) => (q: { sql: string; args: unknown[] }) => read(s).query(q.sql, q.args) as Promise<MetricRows>;
  return {
    traces: async (t) => loadTraces(read(t.scope), t.scope, await findTraceIds(read(t.scope), t, Date.now())),
    trace: (s, traceId) => getTrace(read(s), s, traceId),
    joinedTrace: (primaryId, s, traceId) => joinedTrace(read(s), primaryId, s, traceId),
    counts: (s) => counts(read(s), s),
    traceEnvs: (s) => traceEnvs(read(s), s),
    activeHours: (s, from, to) => activeHours(read(s), s, from, to),
    executor: (s, retentionMs, env) => sqlExecutor({ ...src(s, env), retentionMs, loadTrace: (id) => getTrace(read(s), s, id).then((t) => t ?? null) }),
    settling: async (s, o = {}) => s.projects.reduce((n, p) => n + queue.count(p, o.env, o.before), 0) || null,
    search: (s, q) => searchSql(src(s), q),
    suggest: (s, r) => suggestCh(read(s), s, src(s), r),
    slowestEndpoints: (s, w, minCount, limit) => slowestEndpoints(read(s), s, w, minCount, limit),
    metricData: (m, range, params, now) => runMetricAsync(metricPageSteps("ch", metricScope(m), range, alignNow(now), params), runMetric(m.scope)),
    metricAlertData: (m, name, w, now) => runMetricAsync(metricAlertSteps("ch", metricScope(m), name, w, now), runMetric(m.scope)),
    infraData: (m, range, params, now) => runMetricAsync(infraSteps("ch", metricScope(m), range, alignNow(now), params), runMetric(m.scope)),
  };
}
