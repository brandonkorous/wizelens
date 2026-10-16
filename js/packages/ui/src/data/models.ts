import { useEffect, useMemo, useState } from "react";
import { modelInput, type ModelOf, PAGE_MODELS, type PageName, type TimeRange } from "@wizeworks/lens-core";
import { useRoute } from "../routes";
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
/** How often a server model is asked for again while the page is open. */
const SERVER_REFRESH_MS = 15_000;

/** The route's query as plain model parameters. */
function useParams(): Record<string, string> {
  const { query } = useRoute();
  const key = query.toString();
  return useMemo(() => Object.fromEntries(new URLSearchParams(key)), [key]);
}

function useLocalModel<P extends PageName>(page: P, params: Record<string, string>, enabled: boolean): PageModel<P> {
  const data = useData();
  const [range] = useRange();
  const slowQueryMs = data.info?.analysis?.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS;
  const model = useMemo(() => {
    if (!enabled) return null;
    const input = modelInput(data.traces, range, data.updatedMs, { slowQueryMs }, params);
    return PAGE_MODELS[page](input) as ModelOf<P>;
  }, [enabled, page, data.traces, data.updatedMs, range, slowQueryMs, params]);
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
  const tick = Math.floor(updatedMs / SERVER_REFRESH_MS);
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
  return PAGE_MODELS[page](modelInput(data.traces, range, data.updatedMs, { slowQueryMs }, params)) as ModelOf<P>;
}

/** One page's numbers. Hosts with `serverStats` compute them; otherwise the browser does, from the loaded traces. */
export function usePageModel<P extends PageName>(page: P): PageModel<P> {
  const params = useParams();
  const server = useHost().has("serverStats");
  const local = useLocalModel(page, params, !server);
  const remote = useServerModel(page, params, server);
  return server ? remote : local;
}
