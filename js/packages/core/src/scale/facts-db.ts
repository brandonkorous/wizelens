// Database facts: the db* kinds (summary, query shapes, query endpoints, tables, operations).
import { dbCalls, type DbCall } from "../stats/database.js";
import type { Trace } from "../types.js";
import { displayService } from "../stats/errors.js";
import { databaseOf } from "../stats/services.js";
import { type Contribution, contribution, withServices } from "./agg.js";
import { joinKey } from "./kinds.js";

/** The `db.q` top: the slowest call of the shape. */
export interface QueryTop {
  system: string;
  traceId: string;
  durationMs: number;
}

function callContributions(c: DbCall, slowQueryMs: number): Contribution[] {
  const at = c.startMs;
  const base = { err: c.error ? 1 : 0, sum: c.durationMs, c: [c.durationMs >= slowQueryMs ? 1 : 0] };
  const top: QueryTop = { system: c.system, traceId: c.traceId, durationMs: c.durationMs };
  const out = [
    contribution("db", "", at, base),
    contribution("db.q", c.query, at, { ...base, top: { rank: c.durationMs, data: top } }),
    contribution("db.qd", joinKey(c.operation, databaseOf(c.span), c.query), at, { ...base, top: { rank: c.durationMs, data: top } }),
    contribution("db.qe", joinKey(c.query, c.endpoint), at),
    contribution("db.op", c.operation, at, { sum: c.durationMs }),
  ];
  if (c.table !== null) out.push(contribution("db.t", c.table, at, { sum: c.durationMs, c: [c.rows !== null ? 1 : 0, c.rows ?? 0] }));
  return out.flatMap((x) => withServices(x, [displayService(c.span.service)]));
}

/** Everything one trace's database calls add to the rollups. Slow means at least `slowQueryMs`. */
export const dbFacts = (trace: Trace, slowQueryMs: number): Contribution[] => dbCalls([trace]).flatMap((c) => callContributions(c, slowQueryMs));
