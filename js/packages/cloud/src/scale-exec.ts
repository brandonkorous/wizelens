import { type Executor, PG_DIALECT, type SqlRunner, sqlExecutor } from "@wizeworks/lens-core";
import type { Queryable } from "./db/db.js";
import { getTrace } from "./repo/trace-read.js";

const DAY_MS = 86_400_000;

/** Reads for the SQL executor, on the cloud database. */
export const pgRunner = (q: Queryable): SqlRunner => ({ all: (sql, params) => q.query<Record<string, unknown>>(sql, [...params]) });

/** How long a project's organization keeps data, in ms; `fallbackDays` when the project has no organization. */
export async function projectRetentionMs(q: Queryable, projectId: string, fallbackDays: number): Promise<number> {
  const [row] = await q.query<{ d: number }>("SELECT o.retention_days AS d FROM projects p JOIN orgs o ON o.id = p.org_id WHERE p.id = $1", [projectId]);
  return (row?.d ?? fallbackDays) * DAY_MS;
}

/** Page needs from a project's stats tables, optionally one environment. The 1 h tier keeps the organization's retention. */
export function cloudExecutor(q: Queryable, projectId: string, retentionMs: number, env?: string): Executor {
  return sqlExecutor({
    d: PG_DIALECT,
    run: pgRunner(q),
    scope: { project: projectId, env },
    retentionMs,
    loadTrace: async (id) => (await getTrace(q, projectId, id)) ?? null,
  });
}

/** Traces of a project still waiting for their stats, for `pageContext(..., settling)`. Null when none. */
export async function cloudSettling(q: Queryable, projectId: string, env?: string): Promise<number | null> {
  const [row] = await q.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM traces WHERE project_id = $1 AND settled_ms < updated_ms AND ($2::text = '' OR env = $2::text)",
    [projectId, env ?? ""],
  );
  return row?.n || null;
}
