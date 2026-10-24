// Uptime checks (docs/CONTRACT.md, "Uptime checks"): what a check is, its state, and its incidents. Hubs and the cloud keep them.
import type { Span } from "../types.js";

/** The service every check result is written as, so search and the Uptime page find them. */
export const UPTIME_SERVICE = "wizelens-uptime";
/** Check run span: the check it ran, and whether it passed. */
export const ATTR_UPTIME_CHECK = "wizelens.uptime.check_id";
export const ATTR_UPTIME_OK = "wizelens.uptime.ok";

/** A check run: category "uptime", or (runs written before) a span with a check id. Never app traffic or an app error. */
export const isUptimeSpan = (s: Span): boolean => s.category === "uptime" || s.attributes[ATTR_UPTIME_CHECK] != null;
export const UPTIME_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
export type UptimeMethod = (typeof UPTIME_METHODS)[number];

/** Bounds a check must stay inside. */
export const UPTIME_LIMITS = {
  minIntervalMin: 1,
  maxIntervalMin: 60,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 60_000,
  maxHeaders: 20,
  maxName: 100,
  maxUrl: 2_000,
  maxExpectBody: 500,
  maxChecks: 100,
} as const;

/** A certificate that ends within this many days gets a warning. */
export const TLS_WARN_DAYS = 14;
export const DEFAULT_EXPECT_STATUS = "200-299";

/** What a person sets on a check. */
export interface UptimeCheckInput {
  name: string;
  url: string;
  method: UptimeMethod;
  headers: Record<string, string>;
  /** Status codes that count as up: "200", "200-299", or a list like "200,204,301-302". */
  expectStatus: string;
  /** Text the response body must contain; empty checks nothing. */
  expectBody: string;
  intervalMin: number;
  timeoutMs: number;
  /** The environment results are written in; empty for none. */
  env: string;
  enabled: boolean;
}

/** A check with its newest result. "pending" until it first runs. */
export interface UptimeCheck extends UptimeCheckInput {
  id: string;
  createdMs: number;
  state: "up" | "down" | "pending";
  lastRunMs: number | null;
  lastDurationMs: number | null;
  lastStatus: number | null;
  lastError: string | null;
  /** When the server certificate ends (https only). */
  tlsExpiresMs: number | null;
}

/** A time a check was down: from the first failed run to the first run that passed again. */
export interface UptimeIncident {
  id: string;
  checkId: string;
  startMs: number;
  /** Null while it is still down. */
  endMs: number | null;
  reason: string;
}

/** One run of a check. */
export interface UptimeResult {
  startMs: number;
  durationMs: number;
  ok: boolean;
  status: number | null;
  /** Why the run failed, in words; null when it passed. */
  error: string | null;
  tlsExpiresMs: number | null;
  /** The address that answered, after redirects. */
  finalUrl: string;
  /** Each request of the run, redirects included, with its phase times; absent from runners that do not time them. */
  hops?: UptimeHop[];
}

/** One request of a run: its URL (no query) and when each phase ended, in ms from its start; null when it did not get there. */
export interface UptimeHop {
  url: string;
  status: number | null;
  dnsMs: number | null;
  connectMs: number | null;
  tlsMs: number | null;
  ttfbMs: number | null;
}

/** Whole days until a certificate ends (negative once it has), or null without one. */
export const tlsDaysLeft = (tlsExpiresMs: number | null, now: number): number | null => (tlsExpiresMs === null ? null : Math.floor((tlsExpiresMs - now) / 86_400_000));

/** True when the certificate ends within the warning days, or already has. */
export const tlsWarns = (tlsExpiresMs: number | null, now: number): boolean => {
  const days = tlsDaysLeft(tlsExpiresMs, now);
  return days !== null && days < TLS_WARN_DAYS;
};

/** The route results are written under, one per check: their stats group by it. */
export const uptimeRoute = (checkId: string): string => `/uptime/${checkId}`;

/** The check id in an endpoint name like "GET /uptime/<id>", or null. */
export function checkIdOfEndpoint(endpoint: string): string | null {
  const m = /^\S+ \/uptime\/([A-Za-z0-9_-]+)$/.exec(endpoint);
  return m ? m[1]! : null;
}
