// The SQL compiler: a search tree becomes a condition on fact_search (alias s), with the memory compiler's results.
import { type Cmp, type Piece, SEARCH_FIELDS, type SearchField, type SearchKind, type SearchNode, type SearchValue } from "../../search/ast.js";
import { levelRank } from "../../stats/logs.js";
import { KEY_SEP } from "../kinds.js";
import { type Dialect, likeEscape, lit, lowerOf, SqlText } from "./dialect.js";

interface Column {
  col: string;
  type: "text" | "num" | "bool" | "services";
}

const COLUMNS: Record<SearchField | "outcome", Column> = {
  service: { col: "s.service", type: "services" }, env: { col: "s.env", type: "text" }, trace: { col: "s.trace_id", type: "text" },
  span: { col: "s.span_id", type: "text" }, name: { col: "s.name", type: "text" }, method: { col: "s.method", type: "text" },
  path: { col: "s.path", type: "text" }, route: { col: "s.route", type: "text" }, status: { col: "s.status", type: "num" },
  outcome: { col: "s.outcome", type: "text" }, duration: { col: "s.duration_ms", type: "num" }, level: { col: "s.level_rank", type: "num" },
  category: { col: "s.category", type: "text" }, kind: { col: "s.span_kind", type: "text" }, user: { col: "s.end_user", type: "text" },
  error: { col: "s.error", type: "bool" }, message: { col: "s.message", type: "text" },
};

const FALSE = "1 = 0";
const TRUE = "1 = 1";

/** A LIKE pattern for wildcard pieces, lowercased, with `\` escaping. */
export const likeOf = (pieces: readonly Piece[]): string => pieces.map((p) => (p === null ? "%" : p.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`))).join("");

const like = (q: SqlText, expr: string, pattern: string): string => `${expr} LIKE ${q.p(pattern)}${likeEscape(q.d)}`;

const holds = (_d: Dialect, expr: string, part: string, q: SqlText): string => q.contains(expr, part);

/** Null-safe: a condition that is false (never unknown) when its column is null, so NOT behaves as in memory. */
const safe = (d: Dialect, cond: string): string => (d.name === "sqlite" ? `COALESCE((${cond}), 0)` : `COALESCE((${cond}), FALSE)`);

function textCond(q: SqlText, c: Column, v: SearchValue, prefix: boolean): string {
  const lower = lowerOf(q.d, c.col);
  if (v.type === "exists") return `${c.col} IS NOT NULL AND ${c.col} <> ''`;
  if (v.type === "pattern") return like(q, lower, c.type === "services" ? `%${KEY_SEP}${likeOf(v.pieces)}${KEY_SEP}%` : likeOf(v.pieces));
  if (v.type !== "string") return FALSE;
  const want = v.value.toLowerCase();
  if (c.type === "services") return holds(q.d, lower, `${KEY_SEP}${want}${KEY_SEP}`, q);
  if (prefix) return `substr(${lower}, 1, ${lit([...want].length)}) = ${q.p(want)}`;
  return `${lower} = ${q.p(want)}`;
}

function numCond(q: SqlText, c: Column, cmp: Cmp, v: SearchValue): string {
  if (v.type === "exists") return `${c.col} IS NOT NULL`;
  if (v.type === "number") return `${c.col} ${cmp} ${q.p(v.value)}`;
  if (v.type === "level") return `${c.col} ${cmp} ${lit(levelRank(v.value))}`;
  if (v.type === "statusClass") return `${c.col} >= ${lit(v.value * 100)} AND ${c.col} < ${lit(v.value * 100 + 100)}`;
  return FALSE;
}

function fieldCond(q: SqlText, kind: SearchKind, n: Extract<SearchNode, { type: "field" }>): string {
  if (!(SEARCH_FIELDS[n.field].kinds as readonly SearchKind[]).includes(kind)) return FALSE;
  const c = COLUMNS[n.field === "status" && n.value.type === "spanStatus" ? "outcome" : n.field];
  if (n.value.type === "spanStatus") return `${c.col} = ${q.p(n.value.value)}`;
  if (c.type === "bool") return n.value.type === "exists" ? `${c.col} IS NOT NULL` : n.value.type === "bool" ? (n.value.value ? q.isTrue(c.col) : `NOT ${q.isTrue(c.col)}`) : FALSE;
  if (c.type === "num") return numCond(q, c, n.cmp, n.value);
  return textCond(q, c, n.value, SEARCH_FIELDS[n.field].type === "id");
}

/** Which attribute rows belong to a document: its own span or log line, or any span of a trace or request. */
function ownerCond(kind: SearchKind): string {
  if (kind === "spans") return "a.src = 's' AND a.owner = s.owner";
  if (kind === "logs") return "a.src = 'l' AND a.owner = s.owner";
  return "a.src = 's'";
}

/** ClickHouse: one uncorrelated lookup, which its attribute table (sorted by key and value) answers fast. */
function attrIn(q: SqlText, kind: SearchKind, project: string, head: string, cond: string): string {
  const own = kind === "spans" || kind === "logs";
  const src = kind === "logs" ? "l" : "s";
  const pick = own ? "trace_id, owner" : "trace_id";
  const where = `a.project_id = ${q.p(project)} AND a.src = '${src}' AND ${head} AND ${cond}`;
  return `${own ? "(s.trace_id, s.owner)" : "s.trace_id"} IN (SELECT ${pick} FROM fact_attrs a WHERE ${where})`;
}

/** Parameters are taken in text order, so the key comes before the value. */
function attrCond(q: SqlText, kind: SearchKind, n: Extract<SearchNode, { type: "attr" }>, project?: string): string {
  const v = n.value;
  const head = `a.key = ${q.p(n.key)}`;
  let cond: string;
  if (v.type === "exists") cond = TRUE;
  else if (v.type === "string") cond = `a.value = ${q.p(v.value.toLowerCase())}`;
  else if (v.type === "pattern") cond = like(q, "a.value", likeOf(v.pieces));
  else if (v.type === "number") cond = `a.num ${n.cmp} ${q.p(v.value)}`;
  else cond = FALSE;
  if (q.d.name === "ch" && project !== undefined) return attrIn(q, kind, project, head, cond);
  const scope = `a.${q.d.project} = s.${q.d.project}`;
  return `EXISTS (SELECT 1 FROM fact_attrs a WHERE ${scope} AND a.trace_id = s.trace_id AND ${ownerCond(kind)} AND ${head} AND ${cond})`;
}

/** The condition for a search tree on documents of `kind`; null matches everything. Parameters go to `q` in text order. `project` lets ClickHouse look attributes up without correlation. */
export function searchCond(q: SqlText, kind: SearchKind, node: SearchNode | null, project?: string): string {
  if (!node) return TRUE;
  switch (node.type) {
    case "and":
      return node.items.length ? `(${node.items.map((i) => searchCond(q, kind, i, project)).join(" AND ")})` : TRUE;
    case "or":
      return `(${node.items.map((i) => searchCond(q, kind, i, project)).join(" OR ")})`;
    case "not":
      return `NOT (${searchCond(q, kind, node.item, project)})`;
    case "text":
      return q.textHas("fact_search", "text", node.value.toLowerCase(), "s.");
    case "field":
      return safe(q.d, fieldCond(q, kind, node));
    default:
      return attrCond(q, kind, node, project);
  }
}
