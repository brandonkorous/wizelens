// Autocomplete on ClickHouse: attribute keys and values from the hourly attribute counts (schema-attrs.ts); other fields as the shared SQL does.
import { fieldSuggestions, fixedSuggestions, type SqlSource, type Suggestion, type SuggestRequest, suggestSql, topCounts } from "@wizeworks/lens-core/internal";
import type { TenantScope } from "../store.js";
import type { ChClient } from "./http.js";

const HOUR_MS = 3_600_000;
/** The scope and the window's hours as the first four parameters; an hour counts when it starts before the window ends. */
const WHERE = "org_id = {p1:String} AND has({p2:Array(String)}, project_id) AND src = 's' AND bucket_ms >= {p3:Float64} AND bucket_ms < {p4:Float64}";

/** A LIKE prefix, lowercased and escaped. */
const prefixLike = (prefix: string): string => `${prefix.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Span attribute keys (field null) or one key's values (field "@key"), with how many span attributes had them in the window. */
async function attrCounts(ch: ChClient, scope: TenantScope, r: SuggestRequest): Promise<Map<string, number>> {
  const key = r.field?.slice(1);
  const params: unknown[] = [scope.org, scope.projects, Math.floor(r.window.from / HOUR_MS) * HOUR_MS, r.window.to];
  const sql = key
    ? `SELECT value AS v, sum(n) AS c FROM attr_values_t WHERE ${WHERE} AND key = {p5:String} AND lowerUTF8(value) LIKE {p6:String} GROUP BY value`
    : `SELECT key AS v, sum(n) AS c FROM attr_keys_t WHERE ${WHERE} AND lowerUTF8(key) LIKE {p5:String} GROUP BY key`;
  params.push(...(key ? [key, prefixLike(r.prefix)] : [prefixLike(r.prefix.replace(/^@/, ""))]));
  const rows = await ch.query<{ v: string; c: number }>(`${sql} HAVING c > 0 ORDER BY c DESC, v LIMIT ${Math.max(1, Math.floor(r.limit))}`, params);
  return new Map(rows.map((row) => [key ? row.v : `@${row.v}`, Number(row.c)]));
}

/** Suggestions in the shape of `suggestSql`, reading attribute counts in place of joining every attribute row. */
export async function suggestCh(ch: ChClient, scope: TenantScope, src: SqlSource, r: SuggestRequest): Promise<Suggestion[]> {
  if (r.field !== null && !r.field.startsWith("@")) return suggestSql(src, r);
  const fixed = r.field === null ? (r.prefix.startsWith("@") ? [] : fieldSuggestions(r.prefix)) : fixedSuggestions(r.field, r.prefix);
  return [...fixed, ...topCounts(await attrCounts(ch, scope, r), r.limit)].slice(0, r.limit);
}
