// Ctrl+K hits from the search API: a few requests and log lines for the typed text, from all the host keeps.
import { useEffect, useState } from "react";
import { checkSearch, type LogRow, type RequestItem, type TimeRange } from "@wizeworks/lens-core";
import { runSearch } from "../data/search";
import { fmtMs } from "../format";
import { hrefTo, traceHref } from "../routes";
import type { SearchHit } from "./searchIndex";

const DELAY_MS = 180;

const requestHit = (r: RequestItem): SearchHit => ({
  key: `sr${r.traceId}`, kind: "request", title: `${r.method} ${r.path}`, detail: `${r.status ?? "…"} · ${fmtMs(r.durationMs)} · ${r.service}`, href: hrefTo("requests", [], { trace: r.traceId }),
});

const logHit = (l: LogRow): SearchHit => ({ key: `sl${l.key}`, kind: "log", title: l.message, detail: `${l.level} · ${l.service}`, href: traceHref(l.traceId, "logs") });

/** "Search everything" first, then the host's top requests and log lines for the text. */
export function usePaletteSearch(query: string, range: TimeRange, server: boolean): SearchHit[] {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const q = query.trim();
  useEffect(() => {
    setHits([]);
    if (!q || !checkSearch(q).ok) return;
    let live = true;
    const timer = setTimeout(async () => {
      const args = { q, range, limit: 5 };
      const [requests, logs] = await Promise.all([runSearch({ ...args, kind: "requests" }, null, server), runSearch({ ...args, kind: "logs", limit: 3 }, null, server)]).catch(() => [null, null]);
      if (live) setHits([...((requests?.items ?? []) as RequestItem[]).map(requestHit), ...((logs?.items ?? []) as LogRow[]).map(logHit)]);
    }, DELAY_MS);
    return () => ((live = false), clearTimeout(timer));
  }, [q, range, server]);
  if (!q) return [];
  const all: SearchHit = { key: "search-all", kind: "search", title: `Search everything for “${q}”`, detail: "Requests, traces, spans, logs", href: hrefTo("search", [], { q }) };
  return [all, ...hits];
}
