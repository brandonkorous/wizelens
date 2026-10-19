// A check run as telemetry: one http.server span of the wizelens-uptime service, so every page, search, and alert sees it.
import type { HubLog } from "../hub.js";
import { newSpanId, newTraceId } from "../ids.js";
import type { Attributes, Span } from "../types.js";
import { tlsDaysLeft, TLS_WARN_DAYS, UPTIME_SERVICE, type UptimeCheck, type UptimeResult, uptimeRoute } from "./check.js";

/** The URL as written to spans: no query string, which may carry secrets. */
function safeUrl(raw: string): { full: string; path: string; host: string } {
  const u = new URL(raw);
  return { full: `${u.origin}${u.pathname}`, path: u.pathname, host: u.hostname };
}

function attributesOf(check: UptimeCheck, r: UptimeResult): Attributes {
  const url = safeUrl(check.url);
  const days = tlsDaysLeft(r.tlsExpiresMs, r.startMs);
  return {
    "http.request.method": check.method,
    "http.route": uptimeRoute(check.id),
    "url.full": url.full,
    "url.path": url.path,
    "server.address": url.host,
    ...(r.status === null ? {} : { "http.response.status_code": r.status }),
    "user_agent.original": "WizeLens-Uptime/1",
    "wizelens.uptime.check_id": check.id,
    "wizelens.uptime.check_name": check.name,
    "wizelens.uptime.ok": r.ok,
    ...(r.tlsExpiresMs === null ? {} : { "tls.server.not_after": new Date(r.tlsExpiresMs).toISOString(), "wizelens.uptime.tls_days_left": days }),
  };
}

/** The span and log lines of one run. A failed run is an error span with the reason; a certificate near its end adds a warning line. */
export function uptimeTelemetry(check: UptimeCheck, r: UptimeResult): { spans: Span[]; logs: HubLog[] } {
  const traceId = newTraceId();
  const end = r.startMs + r.durationMs;
  const reason = r.error ?? "";
  const span: Span = {
    traceId,
    spanId: newSpanId(),
    parentSpanId: null,
    name: `${check.method} ${check.name}`,
    kind: "server",
    category: "http.server",
    service: UPTIME_SERVICE,
    startMs: r.startMs,
    durationMs: r.durationMs,
    status: r.ok ? "ok" : "error",
    statusMessage: r.ok ? null : reason,
    attributes: attributesOf(check, r),
    events: r.ok ? [] : [{ name: "exception", timeMs: end, attributes: { "exception.type": "UptimeCheckFailed", "exception.message": `${check.name}: ${reason}` } }],
  };
  const logs: HubLog[] = [];
  const days = tlsDaysLeft(r.tlsExpiresMs, r.startMs);
  const log = (level: "warn" | "error", message: string) => logs.push({ traceId, log: { timeMs: end, level, category: "wizelens.uptime", message, service: UPTIME_SERVICE, spanId: span.spanId, attributes: { "wizelens.uptime.check_id": check.id } } });
  if (!r.ok) log("error", `Uptime check ${check.name} failed: ${reason}`);
  if (days !== null && days < TLS_WARN_DAYS) log("warn", days < 0 ? `The TLS certificate of ${safeUrl(check.url).host} has expired.` : `The TLS certificate of ${safeUrl(check.url).host} expires in ${days} days.`);
  return { spans: [span], logs };
}
