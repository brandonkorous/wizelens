import type { ServiceInfo, Trace, TraceSummary } from "@wizeworks/lens-core";

// Relative on purpose: the dashboard lives under the add-on's base path.
const API = "./api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(res.status === 404 ? "not-found" : `HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  info: () => get<ServiceInfo>("/info"),
  traces: (limit = 200) => get<TraceSummary[]>(`/traces?limit=${limit}`),
  trace: (traceId: string) => get<Trace>(`/traces/${traceId}?federate=true`),
};
