// Counts per kind and a time histogram for the Search page, read through the same search the results use.
import { useEffect, useState } from "react";
import { checkSearch, encodeCursor, type SearchKind, searchSummary, type SearchSummary, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { runSearch } from "./search";

/** The summary of a valid search; null while it loads, for an empty search, or when it fails. */
export function useSearchSummary(q: string, kind: SearchKind, range: TimeRange, server: boolean): SearchSummary | null {
  const [summary, setSummary] = useState<SearchSummary | null>(null);
  useEffect(() => {
    setSummary(null);
    if (!q.trim() || !checkSearch(q).ok) return;
    let live = true;
    const now = Date.now();
    const window = { from: now - TIME_RANGES[range].ms, to: now };
    const run = (s: { kind: SearchKind; cursor?: { timeMs: number; traceId: string; owner: string } | null }) => runSearch({ q, kind: s.kind, range, limit: 200 }, s.cursor ? encodeCursor(s.cursor) : null, server);
    searchSummary(run, kind, null, window).then(
      (s) => live && setSummary(s),
      () => undefined,
    );
    return () => void (live = false);
  }, [q, kind, range, server]);
  return summary;
}
