import type { IncomingMessage, ServerResponse } from "node:http";
import type { WizeAuth } from "./auth/auth.js";
import type { CloudConfig } from "./config.js";
import type { Db } from "./db/db.js";
import type { RouteCtx } from "./http/router.js";
import type { Mailer } from "./mail/mailer.js";

/** Everything a request handler needs. */
export interface CloudApp {
  db: Db;
  config: CloudConfig;
  version: string;
  startedMs: number;
  mailer: Mailer;
  /** Better Auth. Ready once the cloud listens (its address goes into links and cookie checks). */
  readonly auth: WizeAuth;
  /** The address for links: the public URL, or the address the cloud listens on. */
  baseUrl(req?: IncomingMessage): string;
}

export interface Ctx extends RouteCtx {
  app: CloudApp;
}

export type { IncomingMessage, ServerResponse };
