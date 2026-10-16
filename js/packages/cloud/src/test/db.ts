import type { Span } from "@wizeworks/lens-core";
import { type Db, openPglite } from "../db/db.js";
import { migrate } from "../db/migrate.js";

/** A fresh in-memory Postgres with the schema. */
export async function testDb(): Promise<Db> {
  const db = await openPglite();
  await migrate(db);
  return db;
}

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
    attributes: { "http.request.method": "GET", "url.path": "/orders", "http.response.status_code": 200 },
    events: [],
    ...extra,
  };
}
