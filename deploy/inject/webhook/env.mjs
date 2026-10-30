// The variables the webhook gives each injected container, per runtime.

export const MOUNT = "/wizelens";

/** The hook each runtime loads, and how it joins a value the container already sets. */
export const RUNTIMES = {
  node: { name: "NODE_OPTIONS", value: `--import=${MOUNT}/node/dist/auto.js`, join: " " },
  dotnet: { name: "DOTNET_STARTUP_HOOKS", value: `${MOUNT}/dotnet/WizeLens.AutoInstrumentation.dll`, join: ":" },
};

/** The service name: the annotation, then the usual app labels, then the container name. */
export function serviceName(pod, container) {
  const labels = pod.metadata?.labels ?? {};
  const annotations = pod.metadata?.annotations ?? {};
  return annotations["wizelens.dev/service"] || labels["app.kubernetes.io/name"] || labels.app || container.name;
}

/** WizeLens settings for one container. Each is added only when the container does not set it already. */
export function settings(pod, container, config, namespace) {
  const annotations = pod.metadata?.annotations ?? {};
  const out = [
    { name: "WIZELENS_ENABLED", value: "true" },
    { name: "WIZELENS_DASHBOARD", value: String(annotations["wizelens.dev/dashboard"] ?? config.dashboard ?? false) },
    { name: "OTEL_SERVICE_NAME", value: serviceName(pod, container) },
  ];
  const endpoint = annotations["wizelens.dev/endpoint"] || config.endpoint;
  if (endpoint) out.push({ name: "WIZELENS_ENDPOINT", value: endpoint });
  const project = annotations["wizelens.dev/project"] || config.project || namespace;
  if (project) out.push({ name: "WIZELENS_PROJECT", value: project });
  if (config.tokenSecret) {
    out.push({ name: "WIZELENS_TOKEN", valueFrom: { secretKeyRef: { name: config.tokenSecret, key: config.tokenKey || "token", optional: true } } });
  }
  return out;
}
