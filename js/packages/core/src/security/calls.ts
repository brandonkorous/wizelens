// Secrets in URLs, outgoing calls without HTTPS (A04), and outgoing calls a request input points (A01, SSRF).
import { type Finding, httpShape } from "../analysis.js";
import { DEFAULT_REDACT_KEYS, isSensitiveKey } from "../redact.js";
import type { Span, Trace } from "../types.js";
import { spanFinding } from "./headers.js";
import { type SecurityRequest, str } from "./request.js";

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Query keys that are default redact keys, in order. */
export function sensitiveQueryKeys(query: string | null): string[] {
  if (!query) return [];
  const keys = query.split("&").map((p) => decode(p.split("=")[0]!)).filter((k) => k && isSensitiveKey(k, DEFAULT_REDACT_KEYS));
  return [...new Set(keys)];
}

const queryOf = (url: string | null): string | null => (url && url.includes("?") ? url.slice(url.indexOf("?") + 1) : null);

const clients = (t: Trace) => t.spans.filter((s) => s.category === "http.client");

const SECRET_TITLE = "A secret is sent in the URL";

/** The request's own query: shape `METHOD route?key={}`, with only the sensitive keys. */
export function findSecretInUrl(r: SecurityRequest): Finding[] {
  const own = sensitiveQueryKeys(str(r.span, "url.query"));
  const route = str(r.span, "http.route") ?? r.path;
  return own.length ? [spanFinding("secret-in-url", "warning", SECRET_TITLE, `${r.method} ${route}?${own.map((k) => `${k}={}`).join("&")}`, r.span)] : [];
}

/** Outgoing calls with a sensitive key in their query. */
export function findSecretInCalls(trace: Trace): Finding[] {
  return clients(trace).flatMap((s) => (sensitiveQueryKeys(queryOf(str(s, "url.full"))).length ? [spanFinding("secret-in-url", "warning", SECRET_TITLE, httpShape(s), s)] : []));
}

/** Scheme and host of a client span, from `url.full`, else `url.scheme` and `server.address`. */
export function targetOf(s: Span): { scheme: string; host: string; full: string | null } | null {
  const full = str(s, "url.full");
  if (full) {
    try {
      const u = new URL(full);
      return { scheme: u.protocol.replace(":", "").toLowerCase(), host: u.hostname.toLowerCase().replace(/^\[|\]$/g, ""), full };
    } catch {
      return null;
    }
  }
  const scheme = str(s, "url.scheme");
  const host = str(s, "server.address");
  return scheme && host ? { scheme: scheme.toLowerCase(), host: host.toLowerCase(), full: null } : null;
}

const PRIVATE_V4 = /^(?:10\.|127\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.)/;
const INTERNAL_SUFFIX = /(?:\.local|\.internal|\.svc|\.cluster\.local|\.localhost)$/;

/** True for a host on the same machine or network: loopback, private, link-local, a name without a dot, or an internal suffix. */
export function isInternalHost(host: string): boolean {
  if (host === "localhost" || host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host)) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return PRIVATE_V4.test(host);
  return !host.includes(".") || INTERNAL_SUFFIX.test(host);
}

export function findPlainHttp(trace: Trace): Finding[] {
  return clients(trace).flatMap((s) => {
    const t = targetOf(s);
    return t && t.scheme === "http" && !isInternalHost(t.host) ? [spanFinding("plain-http", "warning", "A call goes out without HTTPS", httpShape(s), s)] : [];
  });
}

const hostOfInput = (v: string): string | null => {
  try {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? new URL(v).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

/** True when a request input decides where the call goes. */
export function inputPicksTarget(t: { host: string; full: string | null }, inputs: readonly string[]): boolean {
  return inputs.some((v) => /[.:/]/.test(v) && (v.toLowerCase() === t.host || (!!t.full && t.full.startsWith(v)) || hostOfInput(v) === t.host));
}

export function findSsrf(trace: Trace, r: SecurityRequest): Finding[] {
  if (r.inputs.length === 0) return [];
  return clients(trace).flatMap((s) => {
    const t = targetOf(s);
    return t && inputPicksTarget(t, r.inputs) ? [spanFinding("ssrf", "error", "A request decides where the server calls", httpShape(s), s)] : [];
  });
}
