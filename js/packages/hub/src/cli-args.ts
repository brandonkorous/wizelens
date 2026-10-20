import { parseArgs } from "node:util";
import { DEFAULT_REDACT_KEYS, HUB_TOKEN_ENV } from "@wizeworks/lens-core";
import type { HubOptions } from "./options.js";

export const USAGE = `wizelens-hub: one place for the traces of every service.

Usage: wizelens-hub [options]

  --port <n>          Port. Default 5960.                      (WIZELENS_HUB_PORT)
  --host <addr>       Address. Default 127.0.0.1. Use 0.0.0.0
                      for the network, with --token.           (WIZELENS_HUB_HOST)
  --data <file>       Hub file, or "memory".
                      Default ~/.wizelens/hub/hub.db.          (WIZELENS_HUB_DATA)
  --token <text>      Require this token on every call.        (WIZELENS_HUB_TOKEN)
  --retention <time>  Keep traces this long: 30m, 24h, 7d.
                      Default 7d.                              (WIZELENS_HUB_RETENTION)
  --log-retention <time>
                      Keep log lines this long. Lines in a
                      request go with their trace when that
                      is sooner. Default: --retention.         (WIZELENS_HUB_LOG_RETENTION)
  --max-traces <n>    Keep at most this many. Default 50000.   (WIZELENS_HUB_MAX_TRACES)
  --max-metric-points <n>
                      Keep at most this many metric points.
                      Default 2000000.                         (WIZELENS_HUB_MAX_METRIC_POINTS)
  --slow-query-ms <n> A database call this slow (ms) is slow.
                      Default 100. Projects can set their own. (WIZELENS_HUB_SLOW_QUERY_MS)
  --n-plus-one <n>    This many similar calls in a request is
                      an N+1. Default 5.                       (WIZELENS_HUB_N_PLUS_ONE)
  --redact-keys <a,b> Hide values of keys that contain these,
                      on top of the built-in list.             (WIZELENS_HUB_REDACT_KEYS)
  --mcp               Turn on the read-only MCP endpoint.      (WIZELENS_HUB_MCP=1)
  --no-uptime         Do not run uptime checks.                (WIZELENS_HUB_UPTIME=0)
  --no-osv            Do not check packages against OSV.       (WIZELENS_HUB_OSV=0)
  --import <file>     Copy an add-on's .wizelens/traces.db into
                      the hub at start. Can repeat.
  --sourcemaps <dir>  Read browser source maps from this build
                      folder. Can repeat. Dev servers on this
                      machine need no option.                  (WIZELENS_HUB_SOURCEMAPS=a,b)
  --help              Show this help.
`;

const UNITS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** "30m", "24h", "7d", or plain ms. Undefined when it is not valid. */
export function parseDuration(v: string | undefined): number | undefined {
  const m = /^(\d+(?:\.\d+)?)\s*([smhd]?)$/i.exec(v?.trim() ?? "");
  if (!m) return undefined;
  return Number(m[1]) * (m[2] ? UNITS[m[2].toLowerCase()]! : 1);
}

const int = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

/** The built-in redacted keys plus a comma list; undefined when none are given. */
function keyList(v: string | undefined): string[] | undefined {
  const extra = (v ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  return extra.length ? [...new Set([...DEFAULT_REDACT_KEYS, ...extra])] : undefined;
}

/** Options from the command line, then from the environment. */
export type CliOptions = HubOptions & { imports: string[] };

export function optionsFromArgs(argv: string[], env: NodeJS.ProcessEnv): CliOptions | "help" {
  const { values: a } = parseArgs({
    args: argv,
    options: {
      port: { type: "string" },
      host: { type: "string" },
      data: { type: "string" },
      token: { type: "string" },
      retention: { type: "string" },
      "log-retention": { type: "string" },
      "max-traces": { type: "string" },
      "max-metric-points": { type: "string" },
      "slow-query-ms": { type: "string" },
      "n-plus-one": { type: "string" },
      "redact-keys": { type: "string" },
      mcp: { type: "boolean" },
      "no-uptime": { type: "boolean" },
      "no-osv": { type: "boolean" },
      import: { type: "string", multiple: true },
      sourcemaps: { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
    },
  });
  if (a.help) return "help";
  return {
    port: int(a.port ?? env.WIZELENS_HUB_PORT),
    host: a.host ?? env.WIZELENS_HUB_HOST,
    storagePath: a.data ?? env.WIZELENS_HUB_DATA,
    token: a.token ?? env[HUB_TOKEN_ENV],
    maxAgeMs: parseDuration(a.retention ?? env.WIZELENS_HUB_RETENTION),
    logMaxAgeMs: parseDuration(a["log-retention"] ?? env.WIZELENS_HUB_LOG_RETENTION),
    maxTraces: int(a["max-traces"] ?? env.WIZELENS_HUB_MAX_TRACES),
    maxMetricPoints: int(a["max-metric-points"] ?? env.WIZELENS_HUB_MAX_METRIC_POINTS),
    slowQueryMs: int(a["slow-query-ms"] ?? env.WIZELENS_HUB_SLOW_QUERY_MS),
    nPlusOneThreshold: int(a["n-plus-one"] ?? env.WIZELENS_HUB_N_PLUS_ONE),
    redactKeys: keyList(a["redact-keys"] ?? env.WIZELENS_HUB_REDACT_KEYS),
    enableMcp: a.mcp ?? env.WIZELENS_HUB_MCP === "1",
    uptime: !(a["no-uptime"] ?? env.WIZELENS_HUB_UPTIME === "0"),
    osv: !(a["no-osv"] ?? env.WIZELENS_HUB_OSV === "0"),
    imports: a.import ?? [],
    sourceMaps: { dirs: a.sourcemaps ?? (env.WIZELENS_HUB_SOURCEMAPS ?? "").split(",").map((d) => d.trim()).filter(Boolean) },
  };
}
