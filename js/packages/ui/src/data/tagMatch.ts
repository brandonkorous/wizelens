// Which tags each row on screen has: the host checks rows of requests, traces, spans, and logs; group rows are checked here.
import { useEffect, useMemo, useState } from "react";
import { type GroupKind, groupTags, type LogRow, logOwner, matchKey, type SearchDoc, type SearchKind, TAG_LIMITS, type TagMatches, type TagMatchItem, type TagRule } from "@wizeworks/lens-core";
import { apiSend } from "./api";
import { getScope } from "./prefs";
import { tagScopeQuery, useTags } from "./tags";

/** Ask the host which tags match these rows, in batches it accepts. */
async function fetchMatches(kind: SearchKind, items: readonly TagMatchItem[]): Promise<TagMatches> {
  const env = getScope().env;
  const query = tagScopeQuery();
  const url = `./api/tags/match${query}${env ? `${query ? "&" : "?"}env=${encodeURIComponent(env)}` : ""}`;
  const batches: TagMatchItem[][] = [];
  for (let i = 0; i < items.length; i += TAG_LIMITS.matchItems) batches.push(items.slice(i, i + TAG_LIMITS.matchItems));
  const parts = await Promise.all(batches.map((b) => apiSend<{ matches: TagMatches }>("POST", url, { kind, items: b })));
  return Object.assign({}, ...parts.map((p) => p.matches)) as TagMatches;
}

const NONE: readonly TagRule[] = [];

/** A trace row also wears the tags of its request: request fields such as route and user are not trace fields. */
async function matchesOf(kind: SearchKind, items: readonly TagMatchItem[]): Promise<TagMatches> {
  if (kind !== "traces") return fetchMatches(kind, items);
  const [traces, requests] = await Promise.all([fetchMatches("traces", items), fetchMatches("requests", items)]);
  const out: TagMatches = { ...requests };
  for (const [key, names] of Object.entries(traces)) out[key] = [...new Set([...(out[key] ?? []), ...names])];
  return out;
}

/** The tags of each row, by rule. Rows are matched again when they, the project, or the rules change; a failure shows no tags. */
export function useRowTags<T>(kind: SearchKind, rows: readonly T[], itemOf: (row: T) => TagMatchItem): (row: T) => readonly TagRule[] {
  const tags = useTags();
  // `itemOf` is a new function each render; the rows and their keys decide when to match again.
  const items = useMemo(() => rows.map(itemOf), [rows]);
  const key = items.map((i) => matchKey(i.traceId, i.owner)).join(",");
  const [matches, setMatches] = useState<TagMatches>({});
  useEffect(() => {
    if (!tags?.active.length || !items.length) return setMatches({});
    let live = true;
    matchesOf(kind, items).then((m) => live && setMatches(m), () => live && setMatches({}));
    return () => void (live = false);
  }, [kind, key, tags]);
  return useMemo(() => {
    return (row: T) => {
      const i = itemOf(row);
      const names = new Set(matches[matchKey(i.traceId, i.owner)] ?? []);
      return (tags?.list.tags ?? []).filter((t) => names.has(t.name));
    };
  }, [matches, tags]);
}

/** The tags of group rows (endpoints, services, error groups), from rules that name only what the row is. */
export function useGroupTags(): (kind: GroupKind, doc: SearchDoc) => readonly TagRule[] {
  const tags = useTags();
  return useMemo(() => {
    if (!tags?.active.length) return () => NONE;
    const byName = new Map(tags.list.tags.map((t) => [t.name, t]));
    return (kind: GroupKind, doc: SearchDoc) => groupTags(tags.active, kind, doc).flatMap((n) => byName.get(n) ?? []);
  }, [tags]);
}

/** A request or trace row: its trace, no part, and its start. */
export const traceRow = (r: { traceId: string; startMs: number }): TagMatchItem => ({ traceId: r.traceId, owner: "", timeMs: r.startMs });

/** A log line: its trace, its index in the trace, and when it was written. */
export const logRow = (r: LogRow): TagMatchItem => ({ traceId: r.traceId, owner: logOwner(r), timeMs: r.timeMs });
