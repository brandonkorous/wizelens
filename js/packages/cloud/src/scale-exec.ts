import { type Executor, PG_DIALECT, type SqlRunner, sqlExecutor } from "@wizeworks/lens-core";
import type { Queryable } from "./db/db.js";
import { getTrace } from "./repo/trace-read.js";
import { type SettlingScope, sqlScope, type TenantScope, tenantScope } from "./telemetry/store.js";
import { KEEP_DAYS } from "./repo/settings.js";

const DAY_MS = 86_400_000;

/** Reads for the SQL executor, on the cloud database. */
export const pgRunner = (q: Queryable): SqlRunner => ({ all: (sql, params) => q.query<Record<string, unknown>>(sql, [...params]) });

/** How long a project's organization keeps data, in ms; `fallbackDays` when the project has no organization. */
export async function projectRetentionMs(q: Queryable, projectId: string, fallbackDays: number): Promise<number> {
  const [row] = await q.query<{ d: number }>(`SELECT ${KEEP_DAYS} AS d FROM projects p JOIN orgs o ON o.id = p.org_id WHERE p.id = $1`, [projectId]);
  return (row?.d ?? fallbackDays) * DAY_MS;
}

/** A project's own read scope, with its organization from Postgres. Throws for a project that is gone. */
export async function projectScopeOf(q: Queryable, projectId: string): Promise<TenantScope> {
  const [row] = await q.query<{ org_id: string }>("SELECT org_id FROM projects WHERE id = $1", [projectId]);
  if (!row) throw new Error(`Project ${projectId} does not exist.`);
  return tenantScope(row.org_id, [projectId]);
}

/** Page needs from the scope's stats tables, optionally one environment. The 1 h tier keeps the organization's retention. */
export function cloudExecutor(q: Queryable, scope: TenantScope, retentionMs: number, env?: string): Executor {
  return sqlExecutor({
    d: PG_DIALECT,
    run: pgRunner(q),
    scope: sqlScope(scope, env),
    retentionMs,
    loadTrace: async (id) => (await getTrace(q, scope, id)) ?? null,
  });
}

/** Traces of the scope still waiting for their stats, optionally only those last written at or before `before`. Null when none. */
export async function cloudSettling(q: Queryable, s: TenantScope, o: SettlingScope = {}): Promise<number | null> {
  const [row] = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM traces WHERE org_id = $1 AND project_id = ANY($2) AND settled_ms < updated_ms
     AND ($3::text = '' OR env = $3::text) AND ($4::float8 IS NULL OR updated_ms <= $4::float8)`,
    [s.org, [...s.projects], o.env ?? "", o.before ?? null],
  );
  return row?.n || null;
}
