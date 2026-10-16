import type { Span } from "@wizeworks/lens-core";
import { createHub, type Hub } from "../hub.js";
import type { HubOptions } from "../options.js";

export const T1 = "a".repeat(32);
export const T2 = "b".repeat(32);

export function span(traceId: string, spanId: string, extra: Partial<Span> = {}): Span {
  return {
    traceId,
    spanId,
    parentSpanId: null,
    name: "GET /orders",
    kind: "server",
    category: "http.server",
    service: "orders-api",
    startMs: 1_000_000,
    durationMs: 25,
    status: "unset",
    statusMessage: null,
    attributes: { "http.request.method": "GET", "url.path": "/orders" },
    events: [],
    ...extra,
  };
}

/** A hub in memory on a free port. */
export async function startHub(options: HubOptions = {}): Promise<{ hub: Hub; url: string }> {
  const hub = createHub({ port: 0, storagePath: "memory", audit: () => undefined, ...options });
  return { hub, url: await hub.listen() };
}

export async function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
