// Log retention on both SQL hosts: drop log facts, log search rows, and log rollups older than the log keep time. Raw log rows are each host's.
import { LOG_KINDS } from "../kinds.js";
import { tierCutoff, TIERS } from "../window.js";
import { type Dialect, lit, paramOf, type Statement } from "./dialect.js";

/** The log kinds as an SQL list. They are fixed names, never input. */
export const LOG_KINDS_SQL = [...LOG_KINDS].map((k) => `'${k}'`).join(", ");

/** One statement with the project condition (cloud) or none (hub, null project). `where` takes the placeholder text for the project. */
function scoped(d: Dialect, project: string | null, build: (p: string) => string): Statement {
  if (project === null) return { sql: build(""), params: [] };
  const ph = d.name === "pg" ? "$1" : "?";
  return { sql: build(`${d.project} = ${ph} AND `), params: [paramOf(d, project)] };
}

/** Attribute rows of log lines older than the cutoff: they have no time, so they go by their line in fact_logs (deleted after). */
function attrDelete(d: Dialect, project: string | null, cutoff: number): Statement {
  if (d.name === "pg") {
    return scoped(d, project, (p) => `DELETE FROM fact_attrs a USING fact_logs l WHERE ${p && `l.${p}`}a.${d.project} = l.${d.project} AND a.src = 'l' AND a.trace_id = l.trace_id AND a.owner = CAST(l.idx AS TEXT) AND l.time_ms < ${lit(cutoff)}`);
  }
  return scoped(d, project, (p) => `DELETE FROM fact_attrs WHERE ${p}src = 'l' AND trace_id IN (SELECT trace_id FROM fact_logs WHERE time_ms < ${lit(cutoff)}) AND EXISTS (SELECT 1 FROM fact_logs l WHERE l.trace_id = fact_attrs.trace_id AND l.${d.project} = fact_attrs.${d.project} AND CAST(l.idx AS TEXT) = fact_attrs.owner AND l.time_ms < ${lit(cutoff)})`);
}

/** Writes that drop one project's (or, with a null project, the hub's) log facts and log rollups past `logKeepMs`. */
export function logPruneStatements(d: Dialect, project: string | null, now: number, logKeepMs: number): Statement[] {
  const cutoff = now - logKeepMs;
  const out = [
    attrDelete(d, project, cutoff),
    scoped(d, project, (p) => `DELETE FROM fact_search WHERE ${p}kind = 'logs' AND time_ms < ${lit(cutoff)}`),
    scoped(d, project, (p) => `DELETE FROM fact_logs WHERE ${p}time_ms < ${lit(cutoff)}`),
  ];
  for (const t of TIERS) {
    const edge = tierCutoff(t, now, Math.min(t.keepMs ?? logKeepMs, logKeepMs));
    for (const table of [t.table, t.hist]) out.push(scoped(d, project, (p) => `DELETE FROM ${table} WHERE ${p}kind IN (${LOG_KINDS_SQL}) AND bucket_ms <= ${lit(edge)}`));
  }
  return out;
}
