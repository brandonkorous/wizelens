import { logPruneStatements, PG_DIALECT } from "@wizeworks/lens-core/internal";
import type { Queryable } from "../db/db.js";
import { runStatements } from "../settle.js";
import { KEEP_DAYS } from "./settings.js";

const DAY_MS = 86_400_000;

/** How long each project keeps log lines, in days: its own log retention, else what the project keeps traces for. */
export const LOG_DAYS_SQL = `COALESCE(p.log_retention_days, ${KEEP_DAYS})`;

/** Log retention days per project; projects that no longer exist are left out. */
export async function logDaysOf(q: Queryable, projectIds?: readonly string[]): Promise<Map<string, number>> {
  const where = projectIds ? "WHERE p.id = ANY($1)" : "";
  const rows = await q.query<{ id: string; d: number }>(`SELECT p.id, ${LOG_DAYS_SQL} AS d FROM projects p JOIN orgs o ON o.id = p.org_id ${where}`, projectIds ? [[...projectIds]] : []);
  return new Map(rows.map((r) => [r.id, r.d]));
}

/** Drop log lines past each project's log retention: raw lines, their facts and search rows, and the log rollups. Loose batches go with the traces (pruneByRetention). */
export async function pruneLogsByRetention(q: Queryable, now: number): Promise<void> {
  for (const [project, days] of await logDaysOf(q)) {
    await q.query("DELETE FROM logs WHERE project_id = $1 AND time_ms < $2", [project, now - days * DAY_MS]);
    await runStatements(q, logPruneStatements(PG_DIALECT, project, now, days * DAY_MS));
  }
}
