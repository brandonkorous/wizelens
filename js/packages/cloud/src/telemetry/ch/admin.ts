// ClickHouse upkeep: the facts version, clearing projects, retention changes, projects that no longer exist, and rows without their organization.
import { FACTS_VERSION, LOG_KINDS_SQL, LOOSE_TRACE_PREFIX, TIERS } from "@wizeworks/lens-core/internal";
import type { OrgOf, RetentionOf } from "../store.js";
import type { ChClient } from "./http.js";
import type { SettleQueue } from "./queue.js";
import { ensureMeta, type Rebuild } from "./rebuild.js";
import { ORG_TABLES, PROJECT_TABLES } from "./schema.js";
import { DAY_MS, nextVer } from "./util.js";

/** Tables built by settling: emptied when the facts version changes. */
const STATS = [
  ...["fact_requests", "fact_traces", "fact_logs", "fact_critical", "fact_search", "fact_attrs"].map((t) => `${t}_t`),
  ...TIERS.flatMap((t) => [`${t.table}_t`, `${t.hist}_t`]),
  "attr_keys_t",
  "attr_values_t",
  "settle_state",
];

/** The time each table's expiry counts from, for retention changes. */
const EXPIRE_FROM: Record<string, string> = {
  spans_raw: "start_ms", logs_raw: "time_ms", trace_heads: "start_ms", settle_state: "settled_ms", metric_points_raw: "time_ms", metric_series_t: "last_ms",
  fact_requests_t: "start_ms", fact_traces_t: "start_ms", fact_logs_t: "time_ms", fact_critical_t: "start_ms", fact_search_t: "time_ms", fact_attrs_t: "time_ms",
  rollup_1h_t: "bucket_ms", hist_1h_t: "bucket_ms", metric_1h_t: "bucket_ms", trace_hours_t: "bucket_ms",
  attr_keys_t: "bucket_ms", attr_values_t: "bucket_ms",
};

/** The stats version here: the shared facts version, then this store's own settle format (2: settle states keep fact keys, attribute rows their owner's time). */
const CH_FACTS = `${FACTS_VERSION}.2`;

/** When the facts version changed: empty the stats and settle every trace again, a page at a time. True when it did. */
export async function checkFactsVersionCh(ch: ChClient, rebuild: Rebuild): Promise<boolean> {
  await ensureMeta(ch);
  const [row] = await ch.query<{ value: string }>("SELECT value FROM ch_meta FINAL WHERE key = 'facts'");
  if (row?.value === CH_FACTS) return false;
  for (const t of STATS) await ch.command(`TRUNCATE TABLE IF EXISTS ${t}`);
  await rebuild.start();
  await ch.insert("ch_meta", [{ key: "facts", value: CH_FACTS, ver: nextVer(Date.now()) }]);
  return true;
}

/** Delete every row of a project, in every table. */
export async function clearProjectCh(ch: ChClient, queue: SettleQueue, projectId: string): Promise<void> {
  queue.clear(projectId);
  for (const t of PROJECT_TABLES) await ch.command(`DELETE FROM ${t} WHERE project_id = {p1:String}`, [projectId], { lightweight_deletes_sync: "0" });
}

type Kept = { days: number; logDays: number };

/** Projects with telemetry here, with the retention (trace and log days) their rows were written with. */
async function knownProjects(ch: ChClient): Promise<Map<string, Kept | null>> {
  const ids = await ch.query<{ project_id: string }>("SELECT DISTINCT project_id FROM trace_heads UNION DISTINCT SELECT DISTINCT project_id FROM metric_series_t");
  const kept = await ch.query<{ project_id: string; days: number; log_days: number }>("SELECT project_id, days, if(log_days = 0, days, log_days) AS log_days FROM project_retention FINAL");
  const days = new Map(kept.map((r) => [r.project_id, { days: Number(r.days), logDays: Number(r.log_days) }]));
  return new Map(ids.map((r) => [r.project_id, days.get(r.project_id) ?? null]));
}

const LOOSE = `startsWith(trace_id, '${LOOSE_TRACE_PREFIX}')`;
const LOG_ROW: Record<string, string> = { logs_raw: "1", fact_logs_t: "1", fact_search_t: "kind = 'logs'", fact_attrs_t: "src = 'l'" };

/** The days a table's row is kept, as SQL: log rows by the log days (never past their trace in a request), loose batches and log kinds by the log days. */
function daysSql(table: string): string {
  if (table in LOG_ROW) return `if(${LOOSE}, {p3:Float64}, if(${LOG_ROW[table]}, least({p2:Float64}, {p3:Float64}), {p2:Float64}))`;
  if (table === "trace_heads" || table === "settle_state" || table.startsWith("fact_")) return `if(${LOOSE}, {p3:Float64}, {p2:Float64})`;
  if (table === "trace_hours_t") return "if(loose = 1, {p3:Float64}, {p2:Float64})";
  if (table === "attr_keys_t" || table === "attr_values_t") return "if(src = 'l', {p3:Float64}, {p2:Float64})";
  if (table === "rollup_1h_t" || table === "hist_1h_t") return `if(kind IN (${LOG_KINDS_SQL}), {p3:Float64}, {p2:Float64})`;
  return "{p2:Float64}";
}

/** A new retention for a project's existing rows: their expiry moves (a mutation, run in the background). */
async function moveExpiry(ch: ChClient, projectId: string, k: Kept): Promise<void> {
  for (const [table, col] of Object.entries(EXPIRE_FROM)) {
    await ch.command(`ALTER TABLE ${table} UPDATE expire_ms = ${col} + ${daysSql(table)} WHERE project_id = {p1:String}`, [projectId, k.days * DAY_MS, k.logDays * DAY_MS]);
  }
}

/** Retention runs out by TTL. Here: drop projects deleted in Postgres, and follow retention changes (traces and logs). */
export async function syncProjects(ch: ChClient, queue: SettleQueue, retentionOf: { days: RetentionOf; logDays: RetentionOf }, now: number): Promise<void> {
  const known = await knownProjects(ch);
  if (!known.size) return;
  const current = await retentionOf.days([...known.keys()]);
  const currentLog = await retentionOf.logDays([...known.keys()]);
  for (const [id, had] of known) {
    const days = current.get(id);
    if (days === undefined) await clearProjectCh(ch, queue, id);
    else {
      const k = { days, logDays: currentLog.get(id) ?? days };
      if (had && had.days === k.days && had.logDays === k.logDays) continue;
      if (had) await moveExpiry(ch, id, k);
      await ch.insert("project_retention", [{ project_id: id, days: k.days, log_days: k.logDays, ver: nextVer(now) }]);
    }
  }
}

/** Rows written before `org_id` existed, or by an older process during a deploy, get their project's organization. One mutation per table, waited for. */
export async function stampOrgs(ch: ChClient, orgOf: OrgOf): Promise<void> {
  for (const t of ORG_TABLES) {
    const ids = (await ch.query<{ project_id: string }>(`SELECT DISTINCT project_id FROM ${t} WHERE org_id = ''`)).map((r) => r.project_id);
    const orgs = ids.length ? await orgOf(ids) : new Map<string, string>();
    const known = ids.filter((id) => orgs.has(id));
    if (!known.length) continue;
    const sql = `ALTER TABLE ${t} UPDATE org_id = transform(project_id, {p1:Array(String)}, {p2:Array(String)}, '') WHERE org_id = '' AND has({p1:Array(String)}, project_id)`;
    await ch.command(sql, [known, known.map((id) => orgs.get(id)!)], { mutations_sync: "1" });
  }
}
