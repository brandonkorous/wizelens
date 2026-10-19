// What a search returns per kind, and the documents of one trace, so every host searches the same things.
import { isLooseTraceId } from "../loose.js";
import { requestItemOf, type RequestItem, type TraceItem, traceItemOf } from "../scale/facts-lists.js";
import { type LogRow, logRows } from "../stats/logs.js";
import { requestOf } from "../stats/requests.js";
import type { SpanCategory, SpanKind, SpanStatus, Trace } from "../types.js";
import type { SearchKind } from "./ast.js";
import { logDoc, requestDoc, spanDoc, traceDoc, traceErrorTexts } from "./docs.js";
import type { SearchDoc } from "./match.js";

/** A span as a search result. */
export interface SpanItem {
  traceId: string;
  spanId: string;
  startMs: number;
  durationMs: number;
  service: string;
  name: string;
  kind: SpanKind;
  category: SpanCategory;
  status: SpanStatus;
  method: string | null;
  path: string | null;
  route: string | null;
  httpStatus: number | null;
  user: string | null;
}

export interface SearchItems {
  requests: RequestItem;
  traces: TraceItem;
  spans: SpanItem;
  logs: LogRow;
}

export type SearchItem = SearchItems[SearchKind];

/** One document of a trace: when it happened, which part it is (span id, log index, or ""), and the result row. */
export interface DocEntry<K extends SearchKind = SearchKind> {
  kind: K;
  timeMs: number;
  owner: string;
  doc: SearchDoc;
  item: () => SearchItems[K];
}

const textOf = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function spanItemOf(doc: SearchDoc, startMs: number): SpanItem {
  const f = doc.fields;
  return {
    traceId: String(f.trace), spanId: String(f.span), startMs, durationMs: Number(f.duration), service: String(f.service), name: String(f.name),
    kind: f.kind as SpanKind, category: f.category as SpanCategory, status: f.outcome as SpanStatus, method: textOf(f.method), path: textOf(f.path),
    route: textOf(f.route), httpStatus: typeof f.status === "number" ? f.status : null, user: textOf(f.user),
  };
}

/** The log index from a `traceId:index` key, as text. */
export const logOwner = (row: LogRow): string => row.key.slice(row.key.lastIndexOf(":") + 1);

function requestEntries(t: Trace, env?: string): DocEntry<"requests">[] {
  const row = requestOf(t);
  if (!row) return [];
  const item = requestItemOf(row);
  return [{ kind: "requests", timeMs: item.startMs, owner: "", doc: requestDoc(item, t.spans.map((s) => s.attributes), env, traceErrorTexts(t)), item: () => item }];
}

/** The documents of `kind` in one trace. */
export function docEntries<K extends SearchKind>(t: Trace, kind: K, env?: string): DocEntry<K>[] {
  if (kind === "requests") return requestEntries(t, env) as DocEntry<K>[];
  if (kind === "traces") return isLooseTraceId(t.traceId) ? [] : [{ kind, timeMs: t.startMs, owner: "", doc: traceDoc(t, env), item: () => traceItemOf(t) as SearchItems[K] }];
  if (kind === "logs") {
    return logRows([t]).map((row) => ({ kind, timeMs: row.timeMs, owner: logOwner(row), doc: logDoc(row, env), item: () => row as SearchItems[K] }));
  }
  return t.spans.map((s) => {
    const doc = spanDoc(s, env);
    return { kind, timeMs: s.startMs, owner: s.spanId, doc, item: () => spanItemOf(doc, s.startMs) as SearchItems[K] };
  });
}
