// A02 Security Misconfiguration: missing security headers, version headers, and loose CORS.
import type { Finding } from "../analysis.js";
import type { Span } from "../types.js";
import type { SecurityRequest } from "./request.js";

/** One finding about one span. */
export function spanFinding(kind: Finding["kind"], severity: Finding["severity"], title: string, shape: string, span: Span): Finding {
  return { kind, severity, title, shape, count: 1, totalMs: span.durationMs, spanIds: [span.spanId] };
}

const is2xx = (r: SecurityRequest) => r.status !== null && r.status >= 200 && r.status < 300;

/** The security headers a 2xx answer lacks, sorted. A report-only CSP is not a missing one. */
export function missingHeaders(r: SecurityRequest): string[] {
  const missing: string[] = [];
  if (!r.header("x-content-type-options")) missing.push("x-content-type-options");
  if (isHtml(r)) {
    const csp = r.header("content-security-policy");
    if (!csp && !r.header("content-security-policy-report-only")) missing.push("content-security-policy");
    if (!r.header("x-frame-options") && !(csp ?? "").toLowerCase().includes("frame-ancestors")) missing.push("x-frame-options");
  }
  if (r.https && !r.header("strict-transport-security")) missing.push("strict-transport-security");
  return missing.sort();
}

const isHtml = (r: SecurityRequest) => (r.header("content-type") ?? "").toLowerCase().startsWith("text/html");

/** Headers a proxy in front (Caddy, nginx, a CDN) often adds after the app answered, where WizeLens cannot see them. */
const EDGE_HEADERS = new Set(["strict-transport-security", "x-content-type-options", "x-frame-options"]);

/** The request came through a proxy: it said so with Via or X-Forwarded-*. */
const viaProxy = (r: SecurityRequest) => ["via", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host"].some((h) => !!r.requestHeader(h));

export function findMissingHeaders(r: SecurityRequest): Finding[] {
  if (!r.headersKnown || !is2xx(r)) return [];
  const missing = missingHeaders(r);
  const edge = viaProxy(r) ? missing.filter((h) => EDGE_HEADERS.has(h)) : [];
  const app = missing.filter((h) => !edge.includes(h));
  const out = app.length ? [spanFinding("missing-headers", "warning", "Security headers are missing", app.join(", "), r.span)] : [];
  if (edge.length) out.push(spanFinding("missing-headers", "info", "Security headers may be set at the edge", `${edge.join(", ")} (behind a proxy: check the answer it sends)`, r.span));
  if (isHtml(r) && !r.header("content-security-policy") && r.header("content-security-policy-report-only")) out.push(spanFinding("missing-headers", "info", "CSP in report-only mode", "content-security-policy-report-only: reports, does not block", r.span));
  return out;
}

const ALWAYS = ["x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"];

export function findVersionHeaders(r: SecurityRequest): Finding[] {
  const out: Finding[] = [];
  for (const name of ["server", ...ALWAYS]) {
    const v = r.header(name);
    if (!v || (name === "server" && !/\d+\.\d+/.test(v))) continue;
    out.push(spanFinding("version-header", "info", "A header names the server's software", `${name}: ${v.slice(0, 80)}`, r.span));
  }
  return out;
}

export function findCors(r: SecurityRequest): Finding[] {
  const origin = r.header("access-control-allow-origin")?.trim().toLowerCase();
  const credentials = r.header("access-control-allow-credentials")?.trim().toLowerCase() === "true";
  if (origin === "*" && credentials) return [spanFinding("cors", "warning", "CORS allows any origin with credentials", "access-control-allow-origin: *, with credentials", r.span)];
  if (origin === "null") return [spanFinding("cors", "warning", "CORS allows the null origin", "access-control-allow-origin: null", r.span)];
  return [];
}
