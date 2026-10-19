// A structured search typed into the Requests, Traces, or Logs list: the trace ids it matches, from the hub's search tables.
import { isStructuredSearch, LIST_SEARCH_KIND, searchSql, searchTraceIds, SQLITE_DIALECT, type TimeWindow } from "@wizeworks/lens-core";
import { sqliteRunner } from "./scale-exec.js";
import type { HubStore } from "./store.js";

/** `{ searchIds }` for a list page with a structured `q`; nothing otherwise. */
export async function listSearch(store: HubStore, page: string, params: Record<string, string>, window: TimeWindow, scope: { project?: string; env?: string }): Promise<{ searchIds?: string[] }> {
  const kind = LIST_SEARCH_KIND[page];
  if (!kind || !isStructuredSearch(params.q)) return {};
  const src = { d: SQLITE_DIALECT, run: sqliteRunner(store.db), scope: { project: scope.project } };
  return { searchIds: await searchTraceIds((q) => searchSql(src, q), kind, params.q!, window, scope.env) };
}
