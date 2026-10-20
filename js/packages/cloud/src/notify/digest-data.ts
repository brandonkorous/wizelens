import { alignNow, FACT_SLOW_QUERY_MS, type Headline, pageContext, runPage, SETTLE_BEHIND_MS, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";
import type { DigestPeriod } from "../repo/mail-prefs.js";
import { projectScope, type TelemetryStore } from "../telemetry/store.js";

const DAY_MS = 86_400_000;
export const RANGE_OF: Record<DigestPeriod, TimeRange> = { daily: "24h", weekly: "7d", monthly: "30d" };

/** One project's numbers for one digest: the same models the dashboard pages use, plus the slowest endpoints and alerts. */
export interface DigestData {
  empty: boolean;
  requests: Headline;
  errorRate: Headline;
  avgMs: Headline;
  sqlQueries: Headline;
  p95Ms: number | null;
  errors: { type: string; message: string; count: number }[];
  slowest: { endpoint: string; p95Ms: number; count: number }[];
  insights: { title: string; occurrences: number }[];
  alertsFired: number;
}

async function alertsFired(q: Queryable, projectId: string, from: number, to: number): Promise<number> {
  const [row] = await q.query<{ n: number }>("SELECT count(*)::int AS n FROM alert_events WHERE project_id = $1 AND kind = 'fired' AND time_ms >= $2 AND time_ms < $3", [projectId, from, to]);
  return row?.n ?? 0;
}

/** The digest's numbers, or null when the organization keeps data for less time than the digest covers. */
export async function digestData(q: Queryable, t: TelemetryStore, project: { id: string; orgId: string }, retentionDays: number, period: DigestPeriod, now: number): Promise<DigestData | null> {
  const range = RANGE_OF[period];
  if (TIME_RANGES[range].ms > retentionDays * DAY_MS) return null;
  const scope = projectScope(project);
  const pc = pageContext(range, alignNow(now), {}, { slowQueryMs: FACT_SLOW_QUERY_MS }, await t.settling(scope, { before: now - SETTLE_BEHIND_MS }));
  const ex = t.executor(scope, retentionDays * DAY_MS);
  const [overview, errors] = await Promise.all([runPage("overview", pc, ex), runPage("errors", pc, ex)]);
  const { from, to } = pc.window;
  const h = overview.headlines;
  return {
    empty: !h.total.value && !h.total.previous,
    requests: h.total,
    errorRate: h.errorRate,
    avgMs: h.avgDuration,
    sqlQueries: h.sqlQueries,
    p95Ms: overview.timing.find((t) => t.key === "request")?.p95 ?? null,
    errors: errors.groups.slice(0, 5).map((g) => ({ type: g.type, message: g.message, count: g.count })),
    slowest: await t.slowestEndpoints(scope, { from, to }, 5, 5),
    insights: overview.insights.map((i) => ({ title: i.title, occurrences: i.occurrences })),
    alertsFired: await alertsFired(q, project.id, from, to),
  };
}
