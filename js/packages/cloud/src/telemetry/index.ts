import type { CloudConfig } from "../config.js";
import type { Db } from "../db/db.js";
import { withCachedCounts } from "./cached.js";
import { openClickHouse } from "./ch/store.js";
import { logDaysOf } from "../repo/log-retention.js";
import { pgTelemetry } from "./pg-store.js";
import type { OrgOf, RetentionOf, TelemetryStore } from "./store.js";
import { KEEP_DAYS, type SettingsCache } from "../repo/settings.js";

export type { MetricQuery, SettleOptions, TelemetryStore, TraceQuery } from "./store.js";

/** Retention days of the projects that still exist; deleted projects are left out. */
export const pgRetentionOf = (db: Db): RetentionOf => async (ids) => {
  const rows = await db.query<{ id: string; d: number }>(`SELECT p.id, ${KEEP_DAYS} AS d FROM projects p JOIN orgs o ON o.id = p.org_id WHERE p.id = ANY($1)`, [[...ids]]);
  return new Map(rows.map((r) => [r.id, r.d]));
};

/** The organization of each project that still exists. */
export const pgOrgOf = (db: Db): OrgOf => async (ids) => {
  const rows = await db.query<{ id: string; org_id: string }>("SELECT id, org_id FROM projects WHERE id = ANY($1)", [[...ids]]);
  return new Map(rows.map((r) => [r.id, r.org_id]));
};

/** Log retention days of the projects that still exist: their own, else their organization's. */
export const pgLogRetentionOf = (db: Db): RetentionOf => (ids) => logDaysOf(db, ids);

/** The telemetry store for this cloud: ClickHouse (scale mode) when a URL is set, else the cloud's own database. */
export async function openTelemetry(config: CloudConfig, db: Db, settings?: SettingsCache): Promise<TelemetryStore> {
  const settingsOf = settings && ((id: string) => settings.get(id));
  const store = config.clickhouseUrl
    ? await openClickHouse({ url: config.clickhouseUrl, retentionOf: pgRetentionOf(db), orgOf: pgOrgOf(db), logRetentionOf: pgLogRetentionOf(db), settingsOf, defaultRetentionDays: config.retentionDays, now: config.now, settleWorkers: config.settleWorkers })
    : pgTelemetry(db);
  return withCachedCounts(store, Date.now);
}

/** Drop the telemetry of projects that were deleted (or cleared) in Postgres. */
export async function clearProjects(t: TelemetryStore, projectIds: readonly string[]): Promise<void> {
  for (const id of projectIds) await t.clearProject(id);
}
