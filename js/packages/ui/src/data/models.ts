import { useEffect, useMemo, useState } from "react";
import { memoryExecutor, type ModelOf, pageContext, type PageName, runPageSync, type SyncExecutor, type TimeRange, type Trace } from "@wizeworks/lens-core";
import { useRoute } from "../routes";
import { useChangeTick } from "./changes";
import { useHost, useRange } from "./host";
import { getScope } from "./prefs";
import { provider, useData } from "./provider";
import { apiFetch } from "./api";

export interface PageModel<P extends PageName> {
  model: ModelOf<P> | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_SLOW_QUERY_MS = 100;
const NO_PARAMS: Record<string, string> = {};
/** How often a server model is asked for again while the page is open; with a change stream, only as a fallback. */
const SERVER_REFRESH_MS = 15_000;
const STREAM_FALLBACK_MS = 120_000;

/** The route's query as plain model parameters, with `extra` on top (for example a value from the path). */
function useParams(extra: Record<string, string> = NO_PARAMS): Record<string, string> {
  const { query } = useRoute();
  const key = new URLSearchParams({ ...Object.fromEntries(query), ...extra }).toString();
  return useMemo(() => Object.fromEntries(new URLSearchParams(key)), [key]);
}

const executors = new WeakMap<readonly Trace[], Map<number, SyncExecutor>>();

/** One memory executor per trace list and threshold, shared by every page and export. */
function executorFor(traces: readonly Trace[], slowQueryMs: number): SyncExecutor {
  let byMs = executors.get(traces);
  if (!byMs) executors.set(traces, (byMs = new Map()));
  let ex = byMs.get(slowQueryMs);
  if (!ex) byMs.set(slowQueryMs, (ex = memoryExecutor(traces, { slowQueryMs })));
  return ex;
}

/** A page computed in the browser from the loaded traces, the same way hosts compute it from their database. */
function localModel<P extends PageName>(page: P, params: Record<string, string>, range: TimeRange, traces: readonly Trace[], now: number, slowQueryMs: number): ModelOf<P> {
  return runPageSync(page, pageContext(range, now, params, { slowQueryMs }), executorFor(traces, slowQueryMs));
}

function useLocalModel<P extends PageName>(page: P, params: Record<string, string>, enabled: boolean): PageModel<P> {
  const data = useData();
  const [range] = useRange();
  const slowQueryMs = data.info?.analysis?.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS;
  const model = useMemo(
    () => (enabled ? localModel(page, params, range, data.traces, data.updatedMs, slowQueryMs) : null),
    [enabled, page, data.traces, data.updatedMs, range, slowQueryMs, params],
  );
  return { model, loading: data.loading, error: null };
}

function modelUrl(page: PageName, params: Record<string, string>, range: string): string {
  const scope = getScope();
  const q = new URLSearchParams({ ...params, range });
  if (scope.project) q.set("project", scope.project);
  if (scope.env) q.set("env", scope.env);
  return `./api/models/${page}?${q.toString()}`;
}

function useServerModel<P extends PageName>(page: P, params: Record<string, string>, enabled: boolean): PageModel<P> {
  const [range] = useRange();
  const { updatedMs } = useData();
  const changes = useChangeTick();
  // New data reloads at once when the host streams changes; the old numbers stay on screen until the new ones arrive.
  const tick = `${changes} ${Math.floor(updatedMs / (useHost().has("changes") ? STREAM_FALLBACK_MS : SERVER_REFRESH_MS))}`;
  const url = enabled ? modelUrl(page, params, range) : null;
  const [state, setState] = useState<{ url: string | null; model: ModelOf<P> | null; error: string | null }>({ url: null, model: null, error: null });
  useEffect(() => {
    if (!url) return;
    let live = true;
    apiFetch<ModelOf<P>>(url)
      .then((model) => live && setState({ url, model, error: null }))
      .catch((err: unknown) => live && setState((s) => ({ ...s, url, error: err instanceof Error ? err.message : String(err) })));
    return () => void (live = false);
  }, [url, tick]);
  return { model: state.model, loading: state.url !== url && !state.error, error: state.error };
}

/** A model once, outside React: for exports. Same rules as `usePageModel`. */
export async function loadPageModel<P extends PageName>(page: P, params: Record<string, string>, range: TimeRange, server: boolean): Promise<ModelOf<P>> {
  if (server) return apiFetch<ModelOf<P>>(modelUrl(page, params, range));
  const data = provider.getSnapshot();
  const slowQueryMs = data.info?.analysis?.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS;
  return localModel(page, params, range, data.traces, data.updatedMs, slowQueryMs);
}

/** The sidebar error count from the host (0 until it loads) on hosts that compute stats; null elsewhere, where the browser counts. */
export function useServerErrorCount(): number | null {
  const server = useHost().has("serverStats");
  const badges = useServerModel("badges", NO_PARAMS, server);
  return server ? (badges.model?.errors ?? 0) : null;
}

/** One page's numbers. Hosts with `serverStats` compute them; otherwise the browser does, from the loaded traces. */
export function usePageModel<P extends PageName>(page: P, extra?: Record<string, string>): PageModel<P> {
  const params = useParams(extra);
  const server = useHost().has("serverStats");
  const local = useLocalModel(page, params, !server);
  const remote = useServerModel(page, params, server);
  return server ? remote : local;
}
