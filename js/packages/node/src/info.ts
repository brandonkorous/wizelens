import { createRequire } from "node:module";
import { hostname } from "node:os";
import { type HubSendState, IN_APP_CAPABILITIES, PROJECT_ENV, PROTOCOL_VERSION, type ServiceInfo } from "@wizeworks/lens-core";
import { hubUrlOf } from "./hub-connect.js";
import type { TraceStore } from "./store.js";
import type { WizeLensOptions } from "./types.js";

const require = createRequire(import.meta.url);

export const VERSION: string = (require("../package.json") as { version: string }).version;
export const DEFAULT_SLOW_QUERY_MS = 100;
export const DEFAULT_N_PLUS_ONE = 5;

export interface InfoInputs {
  options: WizeLensOptions;
  store: TraceStore;
  redactKeys: readonly string[];
  startedMs: number;
  sqlite: () => boolean;
  /** True when the add-on keeps metrics. */
  metrics?: boolean;
  /** True when the add-on resolves browser stacks with source maps. */
  sourceMaps?: boolean;
  /** How sending to the hub goes, when one is set. */
  hubSend?: () => HubSendState | undefined;
}

/** `api/info`: who this service is and how WizeLens is set up. */
export function buildInfo(i: InfoInputs): ServiceInfo {
  const o = i.options;
  return {
    protocol: PROTOCOL_VERSION,
    mode: "in-app",
    capabilities: [...IN_APP_CAPABILITIES, "search", "tags", ...(i.metrics ? (["metrics"] as const) : []), ...(i.sourceMaps ? (["sourcemaps"] as const) : [])],
    service: o.serviceName,
    version: VERSION,
    runtime: `node ${process.version}`,
    mcp: !!o.enableMcp,
    environment: process.env.NODE_ENV || "development",
    host: hostname(),
    startedMs: i.startedMs,
    storage: { kind: i.sqlite() ? "sqlite" : "memory", maxTraces: i.store.maxTraces, maxAgeMs: i.store.maxAgeMs },
    analysis: { slowQueryMs: o.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS, nPlusOneThreshold: o.nPlusOneThreshold ?? DEFAULT_N_PLUS_ONE },
    redactKeys: [...i.redactKeys],
    captureResponseBody: !!o.captureResponseBody,
    project: o.project ?? process.env[PROJECT_ENV] ?? undefined,
    hub: hubUrlOf(o) ?? undefined,
    hubSend: i.hubSend?.(),
    sampling: i.store.sampling ?? undefined,
  };
}
