import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { alignNow, type HostsModel, hostsModelOf, INFRA_PARAMS, infraSteps, type KubeModel, kubeModelOf, type MetricData, type MetricRows, runMetricSync, type TimeRange } from "@wizeworks/lens-core";
import { type MetricScope, rangeOf } from "./metrics-read.js";
import { listServices } from "./store-read.js";

export type InfraPage = "hosts" | "kubernetes";

/** Parameters the infrastructure models read; the range and scope are taken out. */
export function infraParams(p: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of INFRA_PARAMS) {
    const v = p.get(k);
    if (v) out[k] = v.slice(0, 300);
  }
  return out;
}

/** Host and Kubernetes series for a scope and range, from the metric rollup tiers. */
export function infraData(db: DatabaseSync, range: TimeRange, scope: MetricScope, params: Record<string, string>, now: number): MetricData {
  const steps = infraSteps("sqlite", { project: scope.project || undefined, env: scope.env || undefined }, range, alignNow(now), params);
  return runMetricSync(steps, (q) => db.prepare(q.sql).all(...(q.args as SQLInputValue[])) as MetricRows);
}

/** The service registry of a scope. */
function registryOf(db: DatabaseSync, scope: MetricScope, now: number) {
  return listServices(db, now).filter((s) => (!scope.project || (s.project ?? "") === scope.project) && (!scope.env || (s.environment ?? "") === scope.env));
}

/** `api/models/hosts` and `api/models/kubernetes`. */
export function infraPage(db: DatabaseSync, page: InfraPage, p: URLSearchParams, now: number): HostsModel | KubeModel {
  const scope = { project: p.get("project") || undefined, env: p.get("env") || undefined };
  const data = infraData(db, rangeOf(p.get("range")), scope, infraParams(p), now);
  const registry = registryOf(db, scope, now);
  return page === "hosts" ? hostsModelOf(data, registry) : kubeModelOf(data, registry);
}
