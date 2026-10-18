// Search rows of one trace: one fact_search row per document, one fact_attrs row per attribute value.
import { SEARCH_KINDS } from "../../search/ast.js";
import { docEntries, logOwner } from "../../search/items.js";
import { numberOf, type SearchDoc } from "../../search/match.js";
import { levelRank, logRows } from "../../stats/logs.js";
import type { Attributes, LogLevel, Trace } from "../../types.js";
import { KEY_SEP } from "../kinds.js";

/** Longest attribute value kept for exact matches; longer values are cut. */
export const ATTR_VALUE_MAX = 512;

export const SEARCH_COLUMNS = {
  fact_search: ["kind", "trace_id", "owner", "env", "time_ms", "span_id", "service", "name", "method", "path", "route", "status", "outcome", "duration_ms", "level_rank", "category", "span_kind", "end_user", "error", "message", "text"],
  fact_attrs: ["trace_id", "src", "owner", "key", "value", "num"],
} as const;

/** Services as stored: "␟a␟b␟", so one name matches with separators around it. */
const servicesText = (v: unknown): string => {
  const list = Array.isArray(v) ? (v as string[]) : typeof v === "string" ? [v] : [];
  return list.length ? `${KEY_SEP}${list.join(KEY_SEP)}${KEY_SEP}` : "";
};

const textOr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOr = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function searchValues(kind: string, traceId: string, owner: string, env: string, timeMs: number, d: SearchDoc): unknown[] {
  const f = d.fields;
  const level = typeof f.level === "string" ? levelRank(f.level as LogLevel) : null;
  return [
    kind, traceId, owner, env, timeMs, textOr(f.span), servicesText(f.service), textOr(f.name), textOr(f.method), textOr(f.path), textOr(f.route), numOr(f.status),
    textOr(f.outcome), numOr(f.duration), level, textOr(f.category), textOr(f.kind), textOr(f.user), f.error === true, textOr(f.message), d.text.join(KEY_SEP),
  ];
}

/** One row per present attribute value: lowercased text, and the number when it reads as one. */
function attrRows(traceId: string, src: "s" | "l", owner: string, attrs: Attributes): unknown[][] {
  const out: unknown[][] = [];
  for (const [key, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === "") continue;
    out.push([traceId, src, owner, key, String(v).toLowerCase().slice(0, ATTR_VALUE_MAX), numberOf(v)]);
  }
  return out;
}

/** The search rows of a trace, project first, keyed like FACT_COLUMNS. */
export function searchRows(t: Trace, scope: { project: string; env: string }): { fact_search: unknown[][]; fact_attrs: unknown[][] } {
  const p = (values: unknown[]) => [scope.project, ...values];
  const docs = SEARCH_KINDS.flatMap((k) => docEntries(t, k, scope.env || undefined));
  const fact_search = docs.map((e) => p(searchValues(e.kind, t.traceId, e.owner, scope.env, e.timeMs, e.doc)));
  const fact_attrs = [
    ...t.spans.flatMap((s) => attrRows(t.traceId, "s", s.spanId, s.attributes)),
    ...logRows([t]).flatMap((row) => attrRows(t.traceId, "l", logOwner(row), row.attributes ?? {})),
  ].map(p);
  return { fact_search, fact_attrs };
}
