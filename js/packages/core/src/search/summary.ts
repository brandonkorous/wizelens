// What a search finds across kinds: how many of each (up to a cap), and when the chosen kind's results happened.
import { bucketStarts, type TimeWindow } from "../stats/common.js";
import { SEARCH_KINDS, type SearchKind, type SearchNode } from "./ast.js";
import { decodeCursor, type SearchPage, type SearchQuery } from "./run.js";

/** Results counted per kind before "1000+". */
export const SUMMARY_CAP = 1000;
const BUCKETS = 24;

export interface SearchSummary {
  counts: Record<SearchKind, { n: number; more: boolean }>;
  /** The chosen kind's results per time bucket (of the counted ones). */
  starts: number[];
  histogram: number[];
}

type Run = (q: SearchQuery) => Promise<SearchPage> | SearchPage;

const timeOf = (item: unknown): number => {
  const i = item as { startMs?: number; timeMs?: number };
  return i.startMs ?? i.timeMs ?? 0;
};

/** Every result of one kind up to the cap, page by page. */
async function countKind(run: Run, kind: SearchKind, node: SearchNode | null, window: TimeWindow, env?: string): Promise<{ times: number[]; more: boolean }> {
  const times: number[] = [];
  let cursor: string | null = null;
  do {
    const page: SearchPage = await run({ kind, node, window, limit: 200, cursor: decodeCursor(cursor), env });
    for (const item of page.items) times.push(timeOf(item));
    cursor = page.next;
  } while (cursor && times.length < SUMMARY_CAP);
  return { times: times.slice(0, SUMMARY_CAP), more: !!cursor };
}

/** Counts of every kind, and the chosen kind's histogram over the window. */
export async function searchSummary(run: Run, kind: SearchKind, node: SearchNode | null, window: TimeWindow, env?: string): Promise<SearchSummary> {
  const all = await Promise.all(SEARCH_KINDS.map((k) => countKind(run, k, node, window, env)));
  const counts = Object.fromEntries(SEARCH_KINDS.map((k, i) => [k, { n: all[i]!.times.length, more: all[i]!.more }])) as SearchSummary["counts"];
  const starts = bucketStarts(window, BUCKETS);
  const size = (window.to - window.from) / BUCKETS;
  const histogram = new Array<number>(BUCKETS).fill(0);
  for (const t of all[SEARCH_KINDS.indexOf(kind)]!.times) {
    const i = Math.floor((t - window.from) / size);
    if (i >= 0 && i < BUCKETS) histogram[i]!++;
  }
  return { counts, starts, histogram };
}
