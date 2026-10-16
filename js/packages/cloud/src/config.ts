import { DEFAULT_REDACT_KEYS } from "@wizeworks/lens-core";

export type SignupMode = "open" | "invite";

export interface CloudOptions {
  /** "postgres://...", "pglite:<folder>", or "memory". Default "pglite:./.wizelens-cloud". */
  database?: string;
  /** Default 5970. 0 picks a free port. */
  port?: number;
  /** Default "0.0.0.0". */
  host?: string;
  /** The address people use, for links in invites and shares. Default http://localhost:<port>. */
  publicUrl?: string;
  /** "invite": only the first account and invited people can sign up. "open": anyone can. Default "invite". */
  signup?: SignupMode;
  /** Default retention for new organizations, in days. Default 30. */
  retentionDays?: number;
  /** Most traces one stats answer reads. Above this, the newest are used and the answer says so. Default 20000. */
  maxStatsTraces?: number;
  /** Ingest calls per key per minute. Default 1200. */
  ingestPerMinute?: number;
  /** How often alert rules run, in ms. Default 60000. */
  alertIntervalMs?: number;
  /** Let alert webhooks call private and local addresses, and plain http. For self-hosting on a private network. Default false. */
  allowPrivateWebhooks?: boolean;
  redactKeys?: string[];
  uiDir?: string;
  /** For tests: the clock and the HTTP client alerts use. */
  now?: () => number;
  fetch?: typeof fetch;
}

export type CloudConfig = Required<Omit<CloudOptions, "uiDir" | "publicUrl">> & { uiDir: string | undefined; publicUrl: string | undefined; secureCookies: boolean };

export function resolveConfig(o: CloudOptions = {}): CloudConfig {
  return {
    database: o.database ?? "pglite:./.wizelens-cloud",
    port: o.port ?? 5970,
    host: o.host ?? "0.0.0.0",
    publicUrl: o.publicUrl?.replace(/\/+$/, ""),
    signup: o.signup ?? "invite",
    retentionDays: o.retentionDays ?? 30,
    maxStatsTraces: o.maxStatsTraces ?? 20_000,
    ingestPerMinute: o.ingestPerMinute ?? 1200,
    alertIntervalMs: o.alertIntervalMs ?? 60_000,
    allowPrivateWebhooks: o.allowPrivateWebhooks ?? false,
    redactKeys: o.redactKeys ?? [...DEFAULT_REDACT_KEYS],
    uiDir: o.uiDir,
    now: o.now ?? Date.now,
    fetch: o.fetch ?? fetch,
    secureCookies: !!o.publicUrl?.startsWith("https://"),
  };
}
