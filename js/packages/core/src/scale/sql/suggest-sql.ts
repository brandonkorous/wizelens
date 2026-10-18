// Autocomplete on a host's fact tables: attribute keys, attribute values, and field values in the window.
import { isSearchField } from "../../search/ast.js";
import { DATA_FIELDS, fieldSuggestions, fixedSuggestions, type Suggestion, type SuggestRequest, topCounts } from "../../search/suggest.js";
import { KEY_SEP } from "../kinds.js";
import { collate, likeEscape, lit, lowerOf, num, type SqlSource, SqlText, scopeWhere } from "./dialect.js";

const COLUMN: Record<string, string> = { service: "service", env: "env", name: "name", method: "method", path: "path", route: "route", category: "category", user: "end_user" };

/** A LIKE prefix, lowercased and escaped. */
const prefixLike = (prefix: string): string => `${prefix.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Attribute rows of spans in the window: keys, or one key's values. */
function attrSql(q: SqlText, src: SqlSource, r: SuggestRequest): string {
  const key = r.field?.slice(1);
  const pick = key ? "a.value" : "a.key";
  const where = [
    ...scopeWhere(q, src.scope, "s."), "s.kind = 'spans'", `s.time_ms >= ${lit(r.window.from)}`, `s.time_ms < ${lit(r.window.to)}`,
    ...(key ? [`a.key = ${q.p(key)}`] : []), `${lowerOf(q.d, pick)} LIKE ${q.p(prefixLike(key ? r.prefix : r.prefix.replace(/^@/, "")))}${likeEscape(q.d)}`,
  ];
  const project = src.d.project;
  return `SELECT ${pick} AS v, COUNT(*) AS n FROM fact_search s JOIN fact_attrs a ON a.${project} = s.${project} AND a.trace_id = s.trace_id AND a.src = 's' AND a.owner = s.owner
    WHERE ${where.join(" AND ")} GROUP BY ${pick} ORDER BY n DESC, ${collate(src.d, pick)} LIMIT ${lit(r.limit)}`;
}

/** One field's values on the rows of its kind in the window. */
function fieldSql(q: SqlText, src: SqlSource, r: SuggestRequest, kind: string, col: string): string {
  const where = [
    ...scopeWhere(q, src.scope, "s."), `s.kind = ${q.p(kind)}`, `s.time_ms >= ${lit(r.window.from)}`, `s.time_ms < ${lit(r.window.to)}`,
    `s.${col} IS NOT NULL`, `s.${col} <> ''`, `${lowerOf(q.d, `s.${col}`)} LIKE ${q.p(prefixLike(col === "service" ? KEY_SEP + r.prefix : r.prefix))}${likeEscape(q.d)}`,
  ];
  return `SELECT s.${col} AS v, COUNT(*) AS n FROM fact_search s WHERE ${where.join(" AND ")} GROUP BY s.${col} ORDER BY n DESC, ${collate(src.d, `s.${col}`)} LIMIT ${lit(r.limit)}`;
}

async function counted(src: SqlSource, r: SuggestRequest): Promise<Map<string, number>> {
  const q = new SqlText(src.d);
  const field = r.field;
  const kind = field && isSearchField(field) ? DATA_FIELDS[field] : undefined;
  if (field !== null && !field.startsWith("@") && !kind) return new Map();
  const sql = field === null || field.startsWith("@") ? attrSql(q, src, r) : fieldSql(q, src, r, kind!, COLUMN[field]!);
  const rows = await src.run.all(sql, q.params);
  const strip = (v: string) => (field === "service" ? v.split(KEY_SEP).filter(Boolean)[0] ?? v : field === null ? `@${v}` : v);
  return new Map(rows.map((row) => [strip(String(row.v)), num(row.n)]));
}

/** Suggestions from the fact tables; the same shape as `suggestMemory`. */
export async function suggestSql(src: SqlSource, r: SuggestRequest): Promise<Suggestion[]> {
  const fixed = r.field === null ? (r.prefix.startsWith("@") ? [] : fieldSuggestions(r.prefix)) : fixedSuggestions(r.field, r.prefix);
  return [...fixed, ...topCounts(await counted(src, r), r.limit)].slice(0, r.limit);
}
