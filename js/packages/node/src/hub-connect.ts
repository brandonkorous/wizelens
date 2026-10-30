import { ENDPOINT_ENV, envSwitch, type HubSender, normalizeHubUrl, type ServiceInfo, TOKEN_ENV } from "@wizeworks/lens-core/internal";
import { HubExporter } from "./hub-export.js";
import { reportPackages } from "./packages.js";
import { releaseOf } from "./release.js";
import type { MetricStore } from "./metrics/store.js";
import type { TraceStore } from "./store.js";
import type { WizeLensOptions } from "./types.js";

export { releaseOf } from "./release.js";

/** Where to send, from options or WIZELENS_ENDPOINT. Null when nothing is set. */
export const endpointOf = (o: WizeLensOptions): string | null => normalizeHubUrl(o.endpoint ?? process.env[ENDPOINT_ENV]);

/** Start sending to the hub, when one is set. Null endpoints mean send-only: the hub gets no address to read from. */
export function connectHub(
  o: WizeLensOptions,
  store: TraceStore,
  info: () => ServiceInfo,
  selfEndpoints: ReadonlySet<string> | null,
  metrics: MetricStore | null = null,
): HubExporter | undefined {
  const url = endpointOf(o);
  if (!url) return undefined;
  const sender = (): HubSender => {
    const i = info();
    const endpoint = selfEndpoints ? (o.publicEndpoint ?? selfEndpoints.values().next().value) : undefined;
    return { service: i.service, project: i.project, version: i.version, release: releaseOf(o), runtime: i.runtime, environment: i.environment, host: i.host, endpoint, startedMs: i.startedMs };
  };
  const exporter = new HubExporter({ url, token: o.token ?? process.env[TOKEN_ENV], sender, warn: (m) => console.warn(m) });
  exporter.attach(store);
  if (metrics) exporter.attachMetrics(metrics);
  exporter.start();
  if (o.reportPackages !== false && envSwitch(process.env, "WIZELENS_PACKAGES") !== false) reportPackages(url, o.token ?? process.env[TOKEN_ENV], sender);
  return exporter;
}
