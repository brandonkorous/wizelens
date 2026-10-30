// Several metrics at once, for a dashboard chart: each one's detail with the same filter and split.
import { useEffect, useMemo, useState } from "react";
import { type MetricDetail, type MetricPoint, metricsModel, type MetricsModel, TIME_RANGES, type TimeRange } from "@wizeworks/lens-core/internal";
import { apiFetch } from "./api";
import { useHost, useRange } from "./host";
import { usePeriodParams } from "./models";
import { getScope, useServiceScope } from "./prefs";

const REFRESH_MS = 30_000;
const IN_APP_RANGE: TimeRange = "1h";

export interface MetricDetails {
  details: (MetricDetail | null)[];
  loading: boolean;
  error: string | null;
}

function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return tick;
}

/** The query of one metric: the period, the service scope, and its stat, filter, and split. */
function useQueries(metrics: readonly { name: string; stat: string }[], where: string, group: string): Record<string, string>[] {
  const period = usePeriodParams();
  const [service] = useServiceScope();
  const key = JSON.stringify([metrics, where, group, period, service]);
  const one = (m: { name: string; stat: string }) => ({ ...period, ...(service ? { service } : {}), metric: m.name, ...(m.stat ? { stat: m.stat } : {}), ...(where ? { where } : {}), ...(group ? { group } : {}) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => metrics.map(one), [key]);
}

function serverUrl(q: Record<string, string>, range: TimeRange): string {
  const scope = getScope();
  const p = new URLSearchParams({ ...q, range, ...(scope.project ? { project: scope.project } : {}), ...(scope.env ? { env: scope.env } : {}) });
  return `./api/models/metrics?${p.toString()}`;
}

/** Load every metric's page model (hubs and the cloud), or compute them from raw points (in-app). */
export function useMetricDetails(metrics: readonly { name: string; stat: string }[], where: string, group: string): MetricDetails {
  const host = useHost();
  const [chosen] = useRange();
  const queries = useQueries(metrics, where, group);
  const tick = useTick();
  const server = host.has("serverMetrics");
  const range = server ? chosen : TIME_RANGES[chosen].ms > TIME_RANGES[IN_APP_RANGE].ms ? IN_APP_RANGE : chosen;
  const [state, setState] = useState<MetricDetails>({ details: [], loading: true, error: null });
  useEffect(() => {
    let live = true;
    const load = server
      ? Promise.all(queries.map((q) => apiFetch<MetricsModel>(serverUrl(q, range)).then((m) => m.selected)))
      : apiFetch<{ points: MetricPoint[] }>(`./api/metrics/points?since=${Math.floor(Date.now() - TIME_RANGES[range].ms)}`).then((p) =>
          queries.map((q) => metricsModel({ points: p.points, range, now: Date.now(), params: q }).selected),
        );
    load.then(
      (details) => live && setState({ details, loading: false, error: null }),
      (e: unknown) => live && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })),
    );
    return () => void (live = false);
  }, [queries, range, server, tick]);
  return state;
}
