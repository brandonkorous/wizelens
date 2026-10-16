import type { IncomingMessage, ServerResponse } from "node:http";
import type { CloudConfig } from "./config.js";
import type { Db } from "./db/db.js";
import type { RouteCtx } from "./http/router.js";

/** Everything a request handler needs. */
export interface CloudApp {
  db: Db;
  config: CloudConfig;
  version: string;
  startedMs: number;
  /** The address for links: the public URL, or the one this request came in on. */
  baseUrl(req: IncomingMessage): string;
}

export interface Ctx extends RouteCtx {
  app: CloudApp;
}

export type { IncomingMessage, ServerResponse };
