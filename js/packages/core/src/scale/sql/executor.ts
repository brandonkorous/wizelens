// The SQL executor: answers needs from the fact and rollup tables, with the memory executor's result shapes.
import { inWindow } from "../../stats/common.js";
import type { Trace } from "../../types.js";
import { emptyResults, type Executor, type NeedResults, type PageContext, type TraceNeed, windowOfRef } from "../needs.js";
import { collate, lit, num, type SqlSource, SqlText, scopeWhere } from "./dialect.js";
import { listSql } from "./list-sql.js";
import { groupsSql, seriesSqlRows } from "./rollup-sql.js";

export interface SqlExecutorOptions extends SqlSource {
  /** How long the 1 h tier keeps buckets: the organization's retention (cloud) or the hub's max age. */
  retentionMs: number;
  /** A whole stored trace by id (cloud `getTrace`, hub `getStoredTrace`). */
  loadTrace(traceId: string): Promise<Trace | null | undefined> | Trace | null | undefined;
}

/** By id when it started in one of the windows; else the newest trace in cur. */
async function traceSql(o: SqlExecutorOptions, need: TraceNeed, ctx: PageContext): Promise<Trace | null> {
  const windows = need.windows.map((r) => windowOfRef(ctx, r));
  if (need.traceId) {
    const q = new SqlText(o.d);
    const where = [...scopeWhere(q, o.scope), `trace_id = ${q.p(need.traceId)}`];
    const rows = await o.run.all(`SELECT start_ms FROM fact_traces WHERE ${where.join(" AND ")}`, q.params);
    if (rows.some((r) => windows.some((w) => inWindow(num(r.start_ms), w)))) {
      const t = await o.loadTrace(need.traceId);
      if (t) return t;
    }
  }
  const q = new SqlText(o.d);
  const where = [...scopeWhere(q, o.scope), `start_ms >= ${lit(ctx.window.from)}`, `start_ms < ${lit(ctx.window.to)}`];
  const [newest] = await o.run.all(`SELECT trace_id FROM fact_traces WHERE ${where.join(" AND ")} ORDER BY start_ms DESC, ${collate(o.d, "trace_id")} LIMIT 1`, q.params);
  return newest ? ((await o.loadTrace(String(newest.trace_id))) ?? null) : null;
}

/** An executor over a host's stats tables. Needs run in parallel; a pool spreads them, one connection queues them. */
export function sqlExecutor(o: SqlExecutorOptions): Executor {
  return {
    async run(needs, ctx): Promise<NeedResults> {
      const out = emptyResults();
      await Promise.all(
        needs.map(async (need) => {
          if (need.type === "trace") return void (out.traces[need.id] = await traceSql(o, need, ctx));
          const w = windowOfRef(ctx, need.window);
          if (need.type === "groups") out.groups[need.id] = await groupsSql(o, need, w, ctx.now, o.retentionMs);
          else if (need.type === "series") out.series[need.id] = await seriesSqlRows(o, need, w, ctx.now, o.retentionMs);
          else out.lists[need.id] = await listSql(o, need, w);
        }),
      );
      return out;
    },
  };
}
