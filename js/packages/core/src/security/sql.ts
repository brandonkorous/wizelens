// A05 Injection: a request input value written into the SQL text as a literal.
import type { Finding } from "../analysis.js";
import { queryText } from "../db-findings.js";
import { isNoSqlSpan } from "../nosql.js";
import type { Trace } from "../types.js";
import type { SecurityRequest } from "./request.js";

const STRING_RE = /'((?:[^']|'')*)'/g;
const NUMBER_RE = /(?:=|<>|!=|<=|>=|<|>|\bIN\s*\()\s*(-?\d+(?:\.\d+)?)(?![\w.])/gi;

/** The literals of a SQL text: quoted strings (`''` is a quote, `%` trimmed at both ends) and compared numbers. */
export function sqlLiterals(sql: string): string[] {
  const out: string[] = [];
  for (const m of sql.matchAll(STRING_RE)) out.push(m[1]!.replace(/''/g, "'").replace(/^%+|%+$/g, ""));
  for (const m of sql.matchAll(NUMBER_RE)) out.push(m[1]!);
  return out;
}

/** SQL spans whose text holds a request input as a literal: one finding per query text. */
export function findSqlInjection(trace: Trace, req: SecurityRequest): Finding[] {
  if (req.inputs.length === 0) return [];
  const inputs = new Set(req.inputs);
  const hits = new Map<string, Finding>();
  for (const s of trace.spans) {
    if (s.category !== "db" || isNoSqlSpan(s) || typeof s.attributes["db.query.text"] !== "string") continue;
    const text = queryText(s);
    if (!sqlLiterals(text).some((l) => inputs.has(l))) continue;
    const f = hits.get(text) ?? { kind: "sql-injection", severity: "error", title: "Request input is written into SQL", shape: text, count: 0, totalMs: 0, spanIds: [] };
    hits.set(text, { ...f, count: f.count + 1, totalMs: f.totalMs + s.durationMs, spanIds: [...f.spanIds, s.spanId] });
  }
  return [...hits.values()];
}
