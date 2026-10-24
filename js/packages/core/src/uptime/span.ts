// A check run as telemetry: one "uptime" span of the wizelens-uptime service. Search and the Uptime page see it; app traffic and errors do not.
import type { HubLog } from "../hub.js";
import { newSpanId, newTraceId } from "../ids.js";
import type { Attributes, Span } from "../types.js";
import { ATTR_UPTIME_CHECK, ATTR_UPTIME_OK, tlsDaysLeft, TLS_WARN_DAYS, UPTIME_SERVICE, type UptimeCheck, type UptimeResult, uptimeRoute } from "./check.js";

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
    [ATTR_UPTIME_CHECK]: check.id,
    "wizelens.uptime.check_name": check.name,
    [ATTR_UPTIME_OK]: r.ok,
    ...(r.hops?.length ? { "wizelens.uptime.hops": JSON.stringify(r.hops) } : {}),
    ...(r.tlsExpiresMs === null ? {} : { "tls.server.not_after": new Date(r.tlsExpiresMs).toISOString(), "wizelens.uptime.tls_days_left": days }),
  };
}

/** The span and log lines of one run. A failed run is an error span with the reason (no exception: it is not an app error); a certificate near its end adds a warning line. */
export function uptimeTelemetry(check: UptimeCheck, r: UptimeResult): { spans: Span[]; logs: HubLog[] } {
  const traceId = newTraceId();
  const end = r.startMs + r.durationMs;
  const reason = r.error ?? "";
  const span: Span = {
    traceId,
    spanId: newSpanId(),
    parentSpanId: null,
    name: `${check.method} ${check.name}`,
    kind: "client",
    category: "uptime",
    service: UPTIME_SERVICE,
    startMs: r.startMs,
    durationMs: r.durationMs,
    status: r.ok ? "ok" : "error",
    statusMessage: r.ok ? null : reason,
    attributes: attributesOf(check, r),
    events: [],
  };
  const logs: HubLog[] = [];
  const days = tlsDaysLeft(r.tlsExpiresMs, r.startMs);
  const log = (level: "warn" | "error", message: string) => logs.push({ traceId, log: { timeMs: end, level, category: "wizelens.uptime", message, service: UPTIME_SERVICE, spanId: span.spanId, attributes: { "wizelens.uptime.check_id": check.id } } });
  if (!r.ok) log("error", `Uptime check ${check.name} failed: ${reason}`);
  if (days !== null && days < TLS_WARN_DAYS) log("warn", days < 0 ? `The TLS certificate of ${safeUrl(check.url).host} has expired.` : `The TLS certificate of ${safeUrl(check.url).host} expires in ${days} days.`);
  return { spans: [span], logs };
}
