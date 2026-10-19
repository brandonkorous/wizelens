import type { IncomingMessage, ServerResponse } from "node:http";
import type { WizeAuth } from "./auth/auth.js";
import type { AuthSecret } from "./auth/secret.js";
import type { Billing } from "./billing/service.js";
import type { Changes } from "./changes.js";
import type { CloudConfig } from "./config.js";
import type { Db } from "./db/db.js";
import type { RouteCtx } from "./http/router.js";
import type { Mailer } from "./mail/mailer.js";
import type { TelemetryStore } from "./telemetry/store.js";

/** Everything a request handler needs. */
export interface CloudApp {
  db: Db;
  /** Spans, logs, metrics, and stats: Postgres in small mode, ClickHouse in scale mode. */
  telemetry: TelemetryStore;
  config: CloudConfig;
  version: string;
  startedMs: number;
  mailer: Mailer;
  /** The auth secrets, newest first, for signed mail links. */
  secrets: readonly AuthSecret[];
  /** Better Auth. Ready once the cloud listens (its address goes into links and cookie checks). */
  readonly auth: WizeAuth;
  /** Plans, usage, limits, and Stripe (with billing on). */
  billing: Billing;
  /** New data per project, for open dashboards. */
  changes: Changes;
  /** The address for links: the public URL, or the address the cloud listens on. */
  baseUrl(req?: IncomingMessage): string;
}

export interface Ctx extends RouteCtx {
  app: CloudApp;
}

export type { IncomingMessage, ServerResponse };
