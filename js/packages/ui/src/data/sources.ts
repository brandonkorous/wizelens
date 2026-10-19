import { type HubService, mergeTraces, type ServiceInfo, type Trace } from "@wizeworks/lens-core";
import { ApiError } from "./api";
import { getScope, type Scope } from "./prefs";

/** One WizeLens service the dashboard reads from: this one, or a downstream one found in trace remotes. */
export interface Source {
  /** Normalized WizeLens base URL, for example "http://localhost:5200/_wizelens". */
  endpoint: string;
  /** True for the service that serves this dashboard. */
  self: boolean;
  info: ServiceInfo | null;
  status: "pending" | "ok" | "down";
  error: string | null;
  /** When the last successful poll started (epoch ms). */
  lastOkMs: number | null;
}

const INITIAL_LIMIT = 2000;
const TIMEOUT_MS = 8000;

/** The WizeLens base URL of the service that serves this page. */
export function selfEndpoint(): string {
  return normalizeEndpoint(new URL("./", window.location.href).href);
}

export const normalizeEndpoint = (url: string): string => url.replace(/[?#].*$/, "").replace(/\/+$/, "");

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? "not-found" : res.status === 401 ? "sign-in needed" : `HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadInfo = (endpoint: string, scope: Scope | null = null): Promise<ServiceInfo> =>
  getJson<ServiceInfo>(`${endpoint}/api/info?${scopeQuery(scope).slice(1)}`);

/** What a hub knows about its services, from `api/services`. */
export interface HubRegistry {
  services: HubService[];
  environments: string[];
  projects: string[];
  traces: number;
  spans: number;
}

/** True when a hub service fits the chosen project and environment. */
export const inScope = (s: HubService, scope: Pick<Scope, "env" | "project">, byProject = true) =>
  (!scope.env || s.environment === scope.env) && (!byProject || !scope.project || s.project === scope.project);

/** "Online", or for a quiet service: "Offline" (add-ons send a heartbeat) or "Idle" (OTLP apps send only when they have data). */
export const presenceOf = (s: HubService) => (s.online ? "Online" : s.via === "addon" ? "Offline" : "Idle");

/** How a service sends, in words. */
export const VIA_LABEL: Record<HubService["via"], string> = { addon: "WizeLens", otlp: "OTLP", uptime: "Uptime checks" };

export const loadRegistry = (endpoint: string, scope: Scope | null = null): Promise<HubRegistry> =>
  getJson<HubRegistry>(`${endpoint}/api/services?${scopeQuery(scope).slice(1)}`);

const scopeQuery = (s: Scope | null) =>
  s ? `${s.env ? `&env=${encodeURIComponent(s.env)}` : ""}${s.project ? `&project=${encodeURIComponent(s.project)}` : ""}` : "";

/** Full traces of one service. With `since`, only traces active since then. With `scope`, only that environment and project (hubs). */
export async function loadTraces(endpoint: string, since: number | null, scope: Scope | null = null, limit = INITIAL_LIMIT): Promise<Trace[]> {
  const q = `full=true&limit=${limit}${since === null ? "" : `&since=${Math.floor(since)}`}${scopeQuery(scope)}`;
  const list = await getJson<Trace[]>(`${endpoint}/api/traces?${q}`);
  // An older add-on answers with summaries only. They carry no spans, so they are skipped.
  return list.filter((t) => Array.isArray(t.spans));
}

/** One trace, merged across services by the add-on, then rebuilt here so clock skew is removed the same way everywhere. */
export const loadTrace = async (traceId: string): Promise<Trace> => {
  const project = getScope().project;
  const t = await getJson<Trace>(`./api/traces/${traceId}?federate=true${project ? `&project=${encodeURIComponent(project)}` : ""}`);
  return mergeTraces(traceId, [t]);
};

export function newSource(endpoint: string, self: boolean): Source {
  return { endpoint, self, info: null, status: "pending", error: null, lastOkMs: null };
}
