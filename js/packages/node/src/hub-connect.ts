import { HUB_ENV, HUB_TOKEN_ENV, type HubSender, normalizeHubUrl, type ServiceInfo } from "@wizeworks/lens-core";
import { HubExporter } from "./hub-export.js";
import type { MetricStore } from "./metrics/store.js";
import type { TraceStore } from "./store.js";
import type { WizeLensOptions } from "./types.js";

/** The hub URL from options, or from WIZELENS_HUB. Null when no hub is set. */
export const hubUrlOf = (o: WizeLensOptions): string | null => normalizeHubUrl(o.hub ?? process.env[HUB_ENV]);

/** Start sending to the hub, when one is set. */
export function connectHub(
  o: WizeLensOptions,
  store: TraceStore,
  info: () => ServiceInfo,
  selfEndpoints: ReadonlySet<string>,
  metrics: MetricStore | null = null,
): HubExporter | undefined {
  const url = hubUrlOf(o);
  if (!url) return undefined;
  const sender = (): HubSender => {
    const i = info();
    const endpoint = o.publicEndpoint ?? selfEndpoints.values().next().value;
    return { service: i.service, project: i.project, version: i.version, runtime: i.runtime, environment: i.environment, host: i.host, endpoint, startedMs: i.startedMs };
  };
  const exporter = new HubExporter({ url, token: o.hubToken ?? process.env[HUB_TOKEN_ENV], sender, warn: (m) => console.warn(m) });
  exporter.attach(store);
  if (metrics) exporter.attachMetrics(metrics);
  exporter.start();
  return exporter;
}
