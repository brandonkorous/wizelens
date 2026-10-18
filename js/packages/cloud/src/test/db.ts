import { randomUUID } from "node:crypto";
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

/** An owner and an organization written straight into the tables, for tests below the HTTP layer. */
export async function seedOrg(db: Db, name = "Acme", retentionDays = 30): Promise<{ userId: string; orgId: string }> {
  const userId = randomUUID();
  const orgId = randomUUID();
  await db.query("INSERT INTO users (id, name, email, email_verified) VALUES ($1, $2, $3, TRUE)", [userId, "Owner", `${userId}@x.io`]);
  await db.query("INSERT INTO orgs (id, name, slug, retention_days, created_at) VALUES ($1, $2, $3, $4, now())", [orgId, name, `org-${orgId}`, retentionDays]);
  await db.query("INSERT INTO members (id, org_id, user_id, role, created_at) VALUES ($1, $2, $3, 'owner', now())", [randomUUID(), orgId, userId]);
  return { userId, orgId };
}
