import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { isTimeRange, type MetricPoint, type MetricsModel, metricsModel, type TimeRange, windowOf } from "@wizeworks/lens-core";

/** Most points one metrics answer reads, newest first. */
export const MAX_MODEL_POINTS = 200_000;

export interface MetricScope {
  project?: string;
  env?: string;
}

/** Points in [from, to) for a scope, newest first, at most `cap`, and how many there are in all. */
export function loadMetricPoints(db: DatabaseSync, from: number, to: number, scope: MetricScope, cap = MAX_MODEL_POINTS): { points: MetricPoint[]; total: number } {
  const where = ["time_ms >= ?", "time_ms < ?"];
  const args: SQLInputValue[] = [from, to];
  if (scope.project) where.push("project = ?"), args.push(scope.project);
  if (scope.env) where.push("env = ?"), args.push(scope.env);
  const sql = `FROM metrics WHERE ${where.join(" AND ")}`;
  const rows = db.prepare(`SELECT json ${sql} ORDER BY time_ms DESC LIMIT ?`).all(...args, cap) as { json: string }[];
  const points = rows.map((r) => JSON.parse(r.json) as MetricPoint);
  const total = points.length < cap ? points.length : (db.prepare(`SELECT count(*) AS n ${sql}`).get(...args) as { n: number }).n;
  return { points, total };
}

/** Parameters the metrics model reads; the range and scope are taken out. */
export function metricParams(p: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["metric", "service", "group", "stat", "q"]) {
    const v = p.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}

export const rangeOf = (v: string | null | undefined, fallback: TimeRange = "1h"): TimeRange => (v && isTimeRange(v) ? v : fallback);

/** The metrics page for a scope and range. */
export function metricsPage(db: DatabaseSync, range: TimeRange, scope: MetricScope, params: Record<string, string>, now: number): MetricsModel {
  const w = windowOf(range, now);
  const { points, total } = loadMetricPoints(db, w.from, w.to, scope);
  const sampled = total > points.length ? { used: points.length, total } : null;
  return metricsModel({ points, range, now, params, sampled });
}
