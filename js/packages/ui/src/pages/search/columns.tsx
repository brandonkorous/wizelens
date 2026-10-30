import { itemOwner, type LogRow, type RequestItem, type SearchItems, type SearchKind, type SpanItem, type TagMatchItem, type TraceItem } from "@wizeworks/lens-core/internal";
import { fmtDateTime, fmtMs } from "../../format";
import { hrefTo, traceHref } from "../../routes";
import { Badge, toneOfHealth, toneOfStatus } from "../../ui/Badges";
import type { Column } from "../../ui/Table";
import { LevelBadge } from "../logs/LogParts";

// Result columns per kind. Every row links to where it came from.
function time<T>(at: (r: T) => number): Column<T> {
  return { key: "time", header: "Time", className: "wl-nowrap", cell: (r) => fmtDateTime(at(r)) };
}

const status = (s: number | null) => (s === null ? "–" : <Badge tone={toneOfStatus(s)}>{s}</Badge>);

const link = (href: string, text: string) => (
  <a href={href} title={text} className="wl-truncate">
    {text}
  </a>
);

const REQUESTS: Column<RequestItem>[] = [
  time((r) => r.startMs),
  { key: "req", header: "Request", className: "wl-search-main", cell: (r) => link(hrefTo("requests", [], { trace: r.traceId }), `${r.method} ${r.path}`) },
  { key: "status", header: "Status", cell: (r) => status(r.status) },
  { key: "dur", header: "Duration", num: true, cell: (r) => fmtMs(r.durationMs) },
  { key: "service", header: "Service", className: "wl-nowrap", cell: (r) => r.service },
];

const TRACES: Column<TraceItem>[] = [
  time((r) => r.startMs),
  { key: "trace", header: "Trace", className: "wl-search-main", cell: (r) => link(traceHref(r.traceId), r.path) },
  { key: "health", header: "Health", cell: (r) => (r.health ? <Badge tone={toneOfHealth(r.health)}>{r.health}</Badge> : "–") },
  { key: "dur", header: "Duration", num: true, cell: (r) => fmtMs(r.durationMs) },
  { key: "spans", header: "Spans", num: true, cell: (r) => r.spanCount },
  { key: "services", header: "Services", className: "wl-search-wrap", cell: (r) => r.services.join(", ") },
];

const spanStatus = (r: SpanItem) => (r.httpStatus !== null ? status(r.httpStatus) : r.status === "error" ? <Badge tone="danger">error</Badge> : "–");

const SPANS: Column<SpanItem>[] = [
  time((r) => r.startMs),
  { key: "span", header: "Span", className: "wl-search-main", cell: (r) => link(traceHref(r.traceId), r.name) },
  { key: "cat", header: "Kind", className: "wl-nowrap", cell: (r) => `${r.category} · ${r.kind}` },
  { key: "status", header: "Status", cell: spanStatus },
  { key: "dur", header: "Duration", num: true, cell: (r) => fmtMs(r.durationMs) },
  { key: "service", header: "Service", className: "wl-nowrap", cell: (r) => r.service },
];

const LOGS: Column<LogRow>[] = [
  time((r) => r.timeMs),
  { key: "level", header: "Level", cell: (r) => <LevelBadge level={r.level} /> },
  { key: "msg", header: "Message", className: "wl-search-main wl-search-wrap", cell: (r) => r.message },
  { key: "service", header: "Service", className: "wl-nowrap", cell: (r) => r.service },
  { key: "trace", header: "Request", className: "wl-search-trace", cell: (r) => link(traceHref(r.traceId, "logs"), r.traceName) },
];

export const SEARCH_COLUMNS: { [K in SearchKind]: Column<SearchItems[K]>[] } = { requests: REQUESTS, traces: TRACES, spans: SPANS, logs: LOGS };

/** The column each kind's tags follow. */
export const TAGGED_COLUMN: Record<SearchKind, string> = { requests: "req", traces: "trace", spans: "span", logs: "msg" };

/** A result as a row to match against tag rules. */
export function resultItem(kind: SearchKind, r: SearchItems[SearchKind]): TagMatchItem {
  const at = r as { traceId: string; startMs?: number; timeMs?: number };
  return { traceId: at.traceId, owner: itemOwner(kind, r), timeMs: at.startMs ?? at.timeMs ?? 0 };
}

/** A key that is unique within one kind's results. */
export function resultKey(kind: SearchKind, r: SearchItems[SearchKind]): string {
  if (kind === "logs") return (r as LogRow).key;
  if (kind === "spans") return `${(r as SpanItem).traceId}:${(r as SpanItem).spanId}`;
  return (r as RequestItem | TraceItem).traceId;
}
