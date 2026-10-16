import type { MetricPoint } from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";

export interface MetricQuery {
  projectId: string;
  from: number;
  to: number;
  env?: string;
  /** Only one metric, for alert rules. */
  name?: string;
  service?: string;
  limit: number;
}

/** Points in [from, to), newest first, at most `limit`, and how many there are in all. */
export async function loadMetricPoints(q: Queryable, m: MetricQuery): Promise<{ points: MetricPoint[]; total: number }> {
  const where = ["project_id = $1", "time_ms >= $2", "time_ms < $3"];
  const args: unknown[] = [m.projectId, m.from, m.to];
  const add = (column: string, v: string | undefined) => v && (args.push(v), where.push(`${column} = $${args.length}`));
  add("env", m.env);
  add("name", m.name);
  add("service", m.service);
  const sql = `FROM metric_points WHERE ${where.join(" AND ")}`;
  const rows = await q.query<{ json: string }>(`SELECT json ${sql} ORDER BY time_ms DESC LIMIT $${args.length + 1}`, [...args, m.limit]);
  const points = rows.map((r) => JSON.parse(r.json) as MetricPoint);
  if (points.length < m.limit) return { points, total: points.length };
  const [row] = await q.query<{ n: string | number }>(`SELECT count(*) AS n ${sql}`, args);
  return { points, total: Number(row?.n ?? points.length) };
}
