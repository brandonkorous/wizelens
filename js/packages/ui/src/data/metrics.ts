import { useEffect, useMemo, useState } from "react";
import { type MetricPoint, metricsModel, type MetricsModel, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core";
import { useRoute } from "../routes";
import { apiFetch } from "./api";
import { useHost, useRange } from "./host";
import { getScope } from "./prefs";

/** Where the metrics page gets its numbers: the server computes them, the browser does from raw points, or the host has none. */
export type MetricsSource = "server" | "points" | "none";

export interface MetricsState {
  model: MetricsModel | null;
  /** True when the host keeps less than the chosen range, so the page shows the last hour. */
  clipped: boolean;
  loading: boolean;
  error: string | null;
  source: MetricsSource;
}

const REFRESH_MS = 10_000;
/** In-app add-ons keep metrics for one hour. */
const IN_APP_RANGE: TimeRange = "1h";

function useParams(): Record<string, string> {
  const { query } = useRoute();
  const key = query.toString();
  return useMemo(() => Object.fromEntries(new URLSearchParams(key)), [key]);
}

/** A number that goes up every `ms`, to load again while the page is open. */
function useTick(ms: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}

function useLoad<T>(url: string | null, tick: number): { data: T | null; url: string | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; url: string | null; error: string | null }>({ data: null, url: null, error: null });
  useEffect(() => {
    if (!url) return;
    let live = true;
    apiFetch<T>(url)
      .then((data) => live && setState({ data, url, error: null }))
      .catch((err: unknown) => live && setState((s) => ({ ...s, url, error: err instanceof Error ? err.message : String(err) })));
    return () => void (live = false);
  }, [url, tick]);
  return state;
}

function serverUrl(params: Record<string, string>, range: TimeRange): string {
  const scope = getScope();
  const q = new URLSearchParams({ ...params, range });
  if (scope.project) q.set("project", scope.project);
  if (scope.env) q.set("env", scope.env);
  return `./api/models/metrics?${q.toString()}`;
}

/** The metrics page model. Hubs and the cloud compute it; in-app add-ons send raw points and the browser computes it. */
export function useMetricsModel(): MetricsState {
  const host = useHost();
  const [chosen] = useRange();
  const params = useParams();
  const tick = useTick(REFRESH_MS);
  const source: MetricsSource = host.has("serverMetrics") ? "server" : host.has("metrics") ? "points" : "none";
  const clipped = source === "points" && TIME_RANGES[chosen].ms > TIME_RANGES[IN_APP_RANGE].ms;
  const range = clipped ? IN_APP_RANGE : chosen;
  const server = useLoad<MetricsModel>(source === "server" ? serverUrl(params, range) : null, tick);
  // The since value moves with the tick, so new points come in; the range only sets how far back.
  const since = useMemo(() => Date.now() - TIME_RANGES[range].ms, [range, tick]);
  const raw = useLoad<{ points: MetricPoint[] }>(source === "points" ? `./api/metrics/points?since=${Math.floor(since)}` : null, tick);
  const local = useMemo(
    () => (raw.data ? metricsModel({ points: raw.data.points, range, now: since + TIME_RANGES[range].ms, params }) : null),
    [raw.data, range, since, params],
  );
  if (source === "server") return { model: server.data, loading: !server.data && !server.error, error: server.error, source, clipped };
  if (source === "points") return { model: local, loading: !raw.data && !raw.error, error: raw.error, source, clipped };
  return { model: null, loading: false, error: null, source, clipped };
}
