// What the Hosts and Kubernetes pages read: infrastructure metric series over the window, with lines for the chosen host, node, or pod.
import { emptyMetricBuckets, METRIC_BUCKETS, type MetricData, type MetricSeriesInfo } from "../metrics/from-rollups.js";
import { type MemoryMetricOptions, metricDataOf } from "../metrics/memory.js";
import { fillMetricBuckets, metricSeriesOfRows, type MetricSteps } from "../metrics/sql-read.js";
import { metricBucketsSql, metricEndsSql, type MetricDialect, type MetricSqlScope, metricTotalsSql } from "../metrics/sql.js";
import type { MetricPoint } from "../metrics/types.js";
import { planSeries, planTotals, snapWindow } from "../scale/window.js";
import { type TimeRange, windowOf } from "../stats/common.js";
import { CHART_METRICS, HOST, INFRA_METRICS, KUBE } from "./names.js";

/** Parameters both pages read: `host`, `node`, `pod` ("namespace/name") pick the entity drawn as lines. */
export const INFRA_PARAMS = ["host", "node", "pod", "cluster", "ns", "workload", "service", "q"] as const;

const NODE_CHARTS = new Set<string>([...KUBE.nodeCpu, KUBE.nodeMem, KUBE.nodeNet]);
const POD_CHARTS = new Set<string>([...KUBE.podCpu, KUBE.podMem, KUBE.podNet]);
const HOST_CHARTS = new Set<string>(Object.values(HOST));
const INFRA = new Set(INFRA_METRICS);

/** "namespace/name" as its two parts; a value with no slash is a name in any namespace. */
export function podRef(v: string): { ns: string | null; name: string } {
  const i = v.indexOf("/");
  return i < 0 ? { ns: null, name: v } : { ns: v.slice(0, i), name: v.slice(i + 1) };
}

const attr = (s: Pick<MetricSeriesInfo, "attributes">, k: string): string => {
  const v = s.attributes[k];
  return v === null || v === undefined ? "" : String(v);
};

/** Whether a series is drawn as a line on the chosen host, node, or pod page. */
export function infraCharted(params: Readonly<Record<string, string>>): (s: MetricSeriesInfo) => boolean {
  const { host, node, pod } = params;
  const ref = pod ? podRef(pod) : null;
  return (s) => {
    if (!CHART_METRICS.includes(s.name)) return false;
    if (host && HOST_CHARTS.has(s.name)) return attr(s, "host.name") === host;
    if (node && NODE_CHARTS.has(s.name)) return attr(s, "k8s.node.name") === node;
    if (ref && POD_CHARTS.has(s.name)) return attr(s, "k8s.pod.name") === ref.name && (ref.ns === null || attr(s, "k8s.namespace.name") === ref.ns);
    return false;
  };
}

/** The raw series key from a series id (project, env, and key joined by U+001F). */
const keyOfId = (id: string) => id.split("\u001f").at(-1)!;

/** The infrastructure data, as SQL steps. `now` is aligned by the host. */
export function* infraSteps(d: MetricDialect, scope: MetricSqlScope, range: TimeRange, now: number, params: Readonly<Record<string, string>>): MetricSteps<MetricData> {
  const w = snapWindow(windowOf(range, now), now);
  const segments = planTotals(w, now, Number.POSITIVE_INFINITY);
  const base = { org: scope.org, projects: scope.projects, env: scope.env, names: INFRA_METRICS };
  const [totals, ends] = [metricTotalsSql(d, base, segments), metricEndsSql(d, base, segments)];
  if (!totals || !ends) return { range, window: w, params, services: [], series: [] };
  const [tRows, eRows] = yield [totals, ends];
  const series = metricSeriesOfRows(tRows!, eRows!);
  const charted = series.filter(infraCharted(params));
  for (const s of charted) s.line = emptyMetricBuckets(METRIC_BUCKETS);
  if (charted.length > 0) {
    const plan = planSeries(w, METRIC_BUCKETS, now, Number.POSITIVE_INFINITY);
    const scoped = { ...base, names: [...new Set(charted.map((s) => s.name))], keys: [...new Set(charted.map((s) => keyOfId(s.id)))] };
    const [rows] = yield [metricBucketsSql(d, scoped, w, METRIC_BUCKETS, plan)];
    fillMetricBuckets(new Map(charted.map((s) => [s.id, s])), rows!, w, METRIC_BUCKETS, plan, (s) => s.line);
  }
  return { range, window: w, params, services: [...new Set(series.map((s) => s.service))].sort(), series };
}

/** The infrastructure data from raw points (in-app hosts and tests). Only charted series keep their lines. */
export function infraDataOf(points: readonly MetricPoint[], range: TimeRange, now: number, params: Readonly<Record<string, string>>, o: MemoryMetricOptions = {}): MetricData {
  const data = metricDataOf(points.filter((p) => INFRA.has(p.name)), range, now, {}, o);
  const charted = infraCharted(params);
  const series = data.series.map((s) => ({ ...s, spark: null, line: charted(s) ? s.line : null }));
  return { ...data, params, series };
}
