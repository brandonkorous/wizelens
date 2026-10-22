import type { WizeLens } from "../types.js";
import { instrumentBetterSqlite3, instrumentNodeSqlite } from "./sqlite.js";
import { instrumentMysql2, labelMysqlClient } from "./mysql2.js";
import { instrumentPg, labelPgClient } from "./pg.js";
import { instrumentPostgresJs, isPostgresJs, labelPostgresJs } from "./postgres.js";

export type DrizzleDriver = "pg" | "postgres-js" | "mysql2" | "better-sqlite3" | "node-sqlite";

interface DrizzleLike {
  $client?: unknown;
  session?: { client?: unknown };
}

/** Which driver a Drizzle client runs on, from the client's shape. */
export function driverOf(client: unknown): DrizzleDriver | null {
  if (isPostgresJs(client)) return "postgres-js";
  const c = client as Record<string, unknown> | null;
  if (!c || typeof c !== "object") return null;
  if (typeof c.prepare === "function" && typeof c.pragma === "function") return "better-sqlite3";
  if (typeof c.prepare === "function" && typeof c.location === "function") return "node-sqlite";
  if (c.Client || c.connectionParameters) return "pg";
  if (c.config || c.pool || c.connection) return "mysql2";
  return null;
}

/** Trace every query of a Drizzle database through its driver. Driver spans carry "drizzle" as the adapter. Returns the driver, or null when it is not supported. */
export function instrumentDrizzle(wizelens: WizeLens, db: unknown): DrizzleDriver | null {
  const d = db as DrizzleLike | null;
  const client = d?.$client ?? d?.session?.client;
  const driver = driverOf(client);
  if (!driver || !client) return null;
  if (driver === "postgres-js") {
    if (!instrumentPostgresJs(wizelens, client)) return null;
    labelPostgresJs(client, "drizzle");
    return driver;
  }
  if (typeof client !== "object") return null;
  if (driver === "better-sqlite3") return instrumentBetterSqlite3(wizelens, client, { adapter: "drizzle" }) ? driver : null;
  if (driver === "node-sqlite") return instrumentNodeSqlite(wizelens, client, { adapter: "drizzle" }) ? driver : null;
  if (driver === "pg") {
    if (!instrumentPg(wizelens, client)) return null;
    labelPgClient(client, "drizzle");
    return driver;
  }
  if (!instrumentMysql2(wizelens, client)) return null;
  labelMysqlClient(client, "drizzle");
  return driver;
}
