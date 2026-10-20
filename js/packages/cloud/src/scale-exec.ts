import { type Executor, PG_DIALECT, type SqlRunner, sqlExecutor } from "@wizeworks/lens-core";
import type { Queryable } from "./db/db.js";
import { getTrace } from "./repo/trace-read.js";
import type { SettlingScope } from "./telemetry/store.js";
import { KEEP_DAYS } from "./repo/settings.js";

const DAY_MS = 86_400_000;

/** Reads for the SQL executor, on the cloud database. */
export const pgRunner = (q: Queryable): SqlRunner => ({ all: (sql, params) => q.query<Record<string, unknown>>(sql, [...params]) });

/** How long a project's organization keeps data, in ms; `fallbackDays` when the project has no organization. */
export async function projectRetentionMs(q: Queryable, projectId: string, fallbackDays: number): Promise<number> {
  const [row] = await q.query<{ d: number }>(`SELECT ${KEEP_DAYS} AS d FROM projects p JOIN orgs o ON o.id = p.org_id WHERE p.id = $1`, [projectId]);
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

/** Traces of a project still waiting for their stats, optionally only those last written at or before `before`. Null when none. */
export async function cloudSettling(q: Queryable, projectId: string, o: SettlingScope = {}): Promise<number | null> {
  const [row] = await q.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM traces WHERE project_id = $1 AND settled_ms < updated_ms AND ($2::text = '' OR env = $2::text) AND ($3::float8 IS NULL OR updated_ms <= $3::float8)",
    [projectId, o.env ?? "", o.before ?? null],
  );
  return row?.n || null;
}
