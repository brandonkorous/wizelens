// ClickHouse upkeep: the facts version, clearing projects, retention changes, and projects that no longer exist.
import { FACTS_VERSION, TIERS } from "@wizeworks/lens-core";
import type { RetentionOf } from "../store.js";
import type { ChClient } from "./http.js";
import type { SettleQueue } from "./queue.js";
import { PROJECT_TABLES } from "./schema.js";
import { DAY_MS, nextVer } from "./util.js";

/** Tables built by settling: emptied when the facts version changes. */
const STATS = [
  ...["fact_requests", "fact_traces", "fact_logs", "fact_critical", "fact_search", "fact_attrs"].map((t) => `${t}_t`),
  ...TIERS.flatMap((t) => [`${t.table}_t`, `${t.hist}_t`]),
  "settle_state",
];

/** The time each table's expiry counts from, for retention changes. */
const EXPIRE_FROM: Record<string, string> = {
  spans_raw: "start_ms", logs_raw: "time_ms", trace_heads: "start_ms", settle_state: "settled_ms", metric_points_raw: "time_ms", metric_series_t: "last_ms",
  fact_requests_t: "start_ms", fact_traces_t: "start_ms", fact_logs_t: "time_ms", fact_critical_t: "start_ms", fact_search_t: "time_ms", fact_attrs_t: "time_ms",
  rollup_1h_t: "bucket_ms", hist_1h_t: "bucket_ms", metric_1h_t: "bucket_ms",
};

/** When the facts version changed: empty the stats and queue every trace again. True when it did. */
export async function checkFactsVersionCh(ch: ChClient, queue: SettleQueue): Promise<boolean> {
  await ch.command("CREATE TABLE IF NOT EXISTS ch_meta (key String, value String, ver UInt64) ENGINE = ReplacingMergeTree(ver) ORDER BY key");
  const [row] = await ch.query<{ value: string }>("SELECT value FROM ch_meta FINAL WHERE key = 'facts'");
  if (row?.value === String(FACTS_VERSION)) return false;
  for (const t of STATS) await ch.command(`TRUNCATE TABLE IF EXISTS ${t}`);
  await queue.requeueAll(ch);
  await ch.insert("ch_meta", [{ key: "facts", value: String(FACTS_VERSION), ver: nextVer(Date.now()) }]);
  return true;
}

/** Delete every row of a project, in every table. */
export async function clearProjectCh(ch: ChClient, queue: SettleQueue, projectId: string): Promise<void> {
  queue.clear(projectId);
  for (const t of PROJECT_TABLES) await ch.command(`DELETE FROM ${t} WHERE project_id = {p1:String}`, [projectId], { lightweight_deletes_sync: "0" });
}

/** Projects with telemetry here, with the retention their rows were written with. */
async function knownProjects(ch: ChClient): Promise<Map<string, number | null>> {
  const ids = await ch.query<{ project_id: string }>("SELECT DISTINCT project_id FROM trace_heads UNION DISTINCT SELECT DISTINCT project_id FROM metric_series_t");
  const kept = await ch.query<{ project_id: string; days: number }>("SELECT project_id, days FROM project_retention FINAL");
  const days = new Map(kept.map((r) => [r.project_id, r.days]));
  return new Map(ids.map((r) => [r.project_id, days.get(r.project_id) ?? null]));
}

/** A new retention for a project's existing rows: their expiry moves (a mutation, run in the background). */
async function moveExpiry(ch: ChClient, projectId: string, days: number): Promise<void> {
  for (const [table, col] of Object.entries(EXPIRE_FROM)) {
    await ch.command(`ALTER TABLE ${table} UPDATE expire_ms = ${col} + {p2:Float64} WHERE project_id = {p1:String}`, [projectId, days * DAY_MS]);
  }
}

/** Retention runs out by TTL. Here: drop projects deleted in Postgres, and follow retention changes. */
export async function syncProjects(ch: ChClient, queue: SettleQueue, retentionOf: RetentionOf, now: number): Promise<void> {
  const known = await knownProjects(ch);
  if (!known.size) return;
  const current = await retentionOf([...known.keys()]);
  for (const [id, had] of known) {
    const days = current.get(id);
    if (days === undefined) await clearProjectCh(ch, queue, id);
    else if (had !== days) {
      if (had !== null) await moveExpiry(ch, id, days);
      await ch.insert("project_retention", [{ project_id: id, days, ver: nextVer(now) }]);
    }
  }
}
