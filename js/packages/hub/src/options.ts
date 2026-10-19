import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_REDACT_KEYS, HUB_DEFAULT_PORT } from "@wizeworks/lens-core";
import type { SourceMapOptions } from "@wizeworks/lens-node/kit";

export interface HubOptions {
  /** Port to listen on. Default 5960. 0 picks a free port. */
  port?: number;
  /** Address to listen on. Default "127.0.0.1" (this machine only). Use "0.0.0.0" for the network, with a token. */
  host?: string;
  /** Where the hub file lives, or "memory". Default `~/.wizelens/hub/hub.db`. */
  storagePath?: string;
  /** When set, every call needs it: `Authorization: Bearer <token>`, or a one-time `?token=` in the browser. */
  token?: string;
  /** Most traces kept. Default 50000. */
  maxTraces?: number;
  /** Oldest trace (and metric point) kept, in ms. Default 7 days. */
  maxAgeMs?: number;
  /** Most metric points kept. Default 2,000,000. */
  maxMetricPoints?: number;
  /** Run uptime checks (they can reach any address this machine can). Default true. */
  uptime?: boolean;
  /** Expose the read-only MCP endpoint at `/_wizelens/mcp`. Default false. */
  enableMcp?: boolean;
  /** Key fragments to redact. Default: the contract list. */
  redactKeys?: string[];
  /** Override where the dashboard build lives. */
  uiDir?: string;
  /** Name shown in the dashboard. Default "wizelens-hub". */
  name?: string;
  /** Where MCP audit lines go. Default console.info. */
  audit?: (line: string) => void;
  /** Source maps with no upload: build folders, and dev servers on this machine (default). False turns them off; uploads still work. */
  sourceMaps?: SourceMapOptions | false;
  now?: () => number;
}

export interface ResolvedHubOptions extends Required<Omit<HubOptions, "token" | "uiDir" | "audit" | "now" | "sourceMaps">> {
  sourceMaps: SourceMapOptions | false | undefined;
  token: string | undefined;
  uiDir: string | undefined;
  audit: (line: string) => void;
  now: () => number;
}

export const DEFAULT_STORAGE_PATH = join(homedir(), ".wizelens", "hub", "hub.db");

export function resolveHubOptions(o: HubOptions = {}): ResolvedHubOptions {
  return {
    port: o.port ?? HUB_DEFAULT_PORT,
    host: o.host ?? "127.0.0.1",
    storagePath: o.storagePath ?? DEFAULT_STORAGE_PATH,
    token: o.token || undefined,
    maxTraces: o.maxTraces ?? 50_000,
    maxAgeMs: o.maxAgeMs ?? 7 * 24 * 60 * 60_000,
    maxMetricPoints: o.maxMetricPoints ?? 2_000_000,
    enableMcp: o.enableMcp ?? false,
    uptime: o.uptime ?? true,
    redactKeys: o.redactKeys ?? [...DEFAULT_REDACT_KEYS],
    uiDir: o.uiDir,
    name: o.name ?? "wizelens-hub",
    audit: o.audit ?? ((line) => console.info(line)),
    sourceMaps: o.sourceMaps,
    now: o.now ?? Date.now,
  };
}
