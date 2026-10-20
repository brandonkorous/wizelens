// Small ClickHouse reads for the services page, project health, and digests.
import type { TimeWindow } from "@wizeworks/lens-core";
import type { TenantScope } from "../store.js";
import type { ChClient } from "./http.js";

const MONTH_MS = 30 * 86_400_000;
/** The scope as the first two parameters. */
const OWNED = "org_id = {p1:String} AND has({p2:Array(String)}, project_id)";
const owned = (s: TenantScope) => [s.org, s.projects];

/** Traces and spans of a scope. */
export async function counts(ch: ChClient, scope: TenantScope): Promise<{ traces: number; spans: number }> {
  const [t] = await ch.query<{ n: number }>(`SELECT uniqExact(trace_id) AS n FROM trace_heads WHERE ${OWNED}`, owned(scope));
  const [s] = await ch.query<{ n: number }>(`SELECT count() AS n FROM spans_raw FINAL WHERE ${OWNED}`, owned(scope));
  return { traces: Number(t?.n ?? 0), spans: Number(s?.n ?? 0) };
}

export async function traceEnvs(ch: ChClient, scope: TenantScope): Promise<string[]> {
  return (await ch.query<{ env: string }>(`SELECT DISTINCT env FROM trace_heads WHERE ${OWNED}`, owned(scope))).map((r) => r.env);
}

/** Distinct hours with a trace start in (from, to]. */
export async function activeHours(ch: ChClient, scope: TenantScope, from: number, to: number): Promise<number> {
  const [row] = await ch.query<{ n: number }>(
    `SELECT uniqExact(intDiv(toInt64(s), 3600000)) AS n FROM (SELECT min(start_ms) AS s FROM trace_heads WHERE ${OWNED}
     AND start_ms <= {p4:Float64} GROUP BY trace_id) WHERE s > {p3:Float64} AND s <= {p4:Float64}`,
    [...owned(scope), from, to],
  );
  return Number(row?.n ?? 0);
}

/** The newest trace start per project, over the last month (older projects count as quiet). */
export async function lastTraceMs(ch: ChClient, now: number): Promise<Map<string, number>> {
  const rows = await ch.query<{ project_id: string; s: number }>(
    `SELECT project_id, max(s) AS s FROM (SELECT project_id, trace_id, min(start_ms) AS s FROM trace_heads WHERE start_ms > {p1:Float64}
     GROUP BY project_id, trace_id) GROUP BY project_id`,
    [now - MONTH_MS],
  );
  return new Map(rows.map((r) => [r.project_id, Number(r.s)]));
}

/** The slowest endpoints by p95 (interpolated, like Postgres percentile_cont) with at least `minCount` requests. */
export async function slowestEndpoints(ch: ChClient, scope: TenantScope, w: TimeWindow, minCount: number, limit: number) {
  const rows = await ch.query<{ endpoint: string; p95: number; n: number }>(
    `SELECT endpoint, quantileExactInclusive(0.95)(duration_ms) AS p95, count() AS n FROM fact_requests
     WHERE ${OWNED} AND start_ms >= {p3:Float64} AND start_ms < {p4:Float64} GROUP BY endpoint HAVING n >= {p5:Float64}
     ORDER BY p95 DESC LIMIT ${Math.max(0, Math.floor(limit))}`,
    [...owned(scope), w.from, w.to, minCount],
  );
  return rows.map((r) => ({ endpoint: r.endpoint, p95Ms: Number(r.p95), count: Number(r.n) }));
}
