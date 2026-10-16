import type { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders } from "node:http";
import type { Attributes as OtelAttributes } from "@opentelemetry/api";
import { REQUEST_HEADER_PREFIX } from "@wizeworks/lens-core";
import { firstHeader } from "./http-util.js";
import { CATEGORY_ATTR } from "./processor.js";

const MAX_HEADERS = 50;
const MAX_HEADER_VALUE = 1024;

/** Headers as `{prefix}{lower-case name}` attributes. Redaction happens when the span is stored. */
export function headerAttributes(headers: IncomingHttpHeaders | OutgoingHttpHeaders, prefix: string): OtelAttributes {
  const out: OtelAttributes = {};
  let count = 0;
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || count >= MAX_HEADERS) continue;
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    out[`${prefix}${name.toLowerCase()}`] = text.slice(0, MAX_HEADER_VALUE);
    count++;
  }
  return out;
}

/** First X-Forwarded-For address, else the socket peer. IPv4-mapped IPv6 is shown as IPv4. */
export function clientAddress(req: IncomingMessage): string | undefined {
  const raw = firstHeader(req.headers["x-forwarded-for"]) ?? req.socket?.remoteAddress;
  return raw?.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, "$1");
}

/** Attributes known when the request starts. */
export function requestAttributes(req: IncomingMessage, method: string, path: string, rawUrl: string): OtelAttributes {
  const host = req.headers.host ?? "";
  const attributes: OtelAttributes = {
    [CATEGORY_ATTR]: "http.server",
    "http.request.method": method,
    "url.path": path,
    "server.address": host.split(":")[0] ?? host,
    ...headerAttributes(req.headers, REQUEST_HEADER_PREFIX),
  };
  const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  if (query) attributes["url.query"] = query;
  const ua = req.headers["user-agent"];
  if (ua) attributes["user_agent.original"] = ua;
  const client = clientAddress(req);
  if (client) attributes["client.address"] = client;
  const size = Number(req.headers["content-length"]);
  if (Number.isFinite(size) && size >= 0 && req.headers["content-length"] !== undefined) attributes["http.request.body.size"] = size;
  return attributes;
}
