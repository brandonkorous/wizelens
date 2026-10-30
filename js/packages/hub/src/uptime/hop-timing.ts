// Phase times of one uptime request (DNS, connect, TLS, first byte), and which phase a failed one stalled in.
import type { ClientRequest } from "node:http";
import { isIP } from "node:net";
import type { UptimeHop } from "@wizeworks/lens-core/internal";

/** Time a request's phases from its socket events, in ms from when it was sent. The hop fills in as the request goes. */
export function timeHop(req: ClientRequest, url: URL): UptimeHop {
  const t0 = performance.now();
  const ms = () => Math.round((performance.now() - t0) * 10) / 10;
  const hop: UptimeHop = { url: `${url.origin}${url.pathname}`, status: null, dnsMs: null, connectMs: null, tlsMs: null, ttfbMs: null };
  req.once("socket", (s) => {
    s.once("lookup", () => void (hop.dnsMs = ms()));
    s.once("connect", () => void (hop.connectMs = ms()));
    s.once("secureConnect", () => void (hop.tlsMs = ms()));
  });
  req.once("response", (res) => void ((hop.ttfbMs = ms()), (hop.status = res.statusCode ?? null)));
  return hop;
}

/** The phase a hop had not finished: what it was waiting on when it failed or timed out. */
export function stalledPhase(hop: UptimeHop): string {
  const https = hop.url.startsWith("https:");
  if (hop.ttfbMs !== null) return "reading the answer";
  if (hop.tlsMs !== null || (hop.connectMs !== null && !https)) return "waiting for the first byte";
  if (hop.connectMs !== null) return "in the TLS handshake";
  if (hop.dnsMs !== null || isIP(new URL(hop.url).hostname.replace(/^\[|\]$/g, ""))) return "connecting";
  return "resolving the host name";
}

/** Where a failed run stalled: its last hop's URL and phase, for the reason people read. */
export const stallText = (hops: readonly UptimeHop[]): string => {
  const last = hops[hops.length - 1];
  return last ? ` at ${last.url} (${stalledPhase(last)})` : "";
};
