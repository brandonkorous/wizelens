import { createRequire } from "node:module";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { otlpSignalOf } from "@wizeworks/lens-hub/kit";
import { resolveUiDir, serveUi } from "@wizeworks/lens-node/kit";
import type { CloudApp, Ctx } from "./app.js";
import { type CloudOptions, resolveConfig } from "./config.js";
import { type Db, openDb } from "./db/db.js";
import { migrate } from "./db/migrate.js";
import { HttpError, sendJson } from "./http/http.js";
import { RateLimiter } from "./http/limiter.js";
import { Router } from "./http/router.js";
import { startJobs } from "./jobs.js";
import { checkFactsVersion } from "./settle.js";
import { allRoutes } from "./routes/index.js";
import { ingestBatch, ingestOtlp } from "./routes/ingest.js";

const require = createRequire(import.meta.url);
export const CLOUD_VERSION: string = (require("../package.json") as { version: string }).version;
const BASE = "/_wizelens";

export interface Cloud {
  readonly server: Server;
  readonly app: CloudApp;
  listen(): Promise<string>;
  close(): Promise<void>;
}

interface Parts {
  app: CloudApp;
  router: Router<Ctx>;
  ingest: RateLimiter;
  uiDir: string | null;
}

/** Changes from a browser must carry the dashboard header, so a page on another site cannot send them. */
const needsClientHeader = (req: IncomingMessage, sub: string) =>
  req.method !== "GET" && req.method !== "HEAD" && !req.headers.authorization && sub.startsWith("api/") && sub !== "api/ingest";

async function routeBase(p: Parts, ctx: Ctx, sub: string): Promise<void> {
  const { req, res } = ctx;
  if (sub === "api/ingest" && req.method === "POST") return ingestBatch(ctx, p.ingest);
  if (needsClientHeader(req, sub) && req.headers["x-wizelens-client"] !== "dashboard") throw new HttpError(403, "Missing the X-WizeLens-Client header.");
  const m = p.router.match(req.method ?? "GET", sub);
  if (m) return m.handler({ ...ctx, params: m.params });
  if (sub.startsWith("api/") || sub === "mcp") throw new HttpError(p.router.hasPath(sub) ? 405 : 404, "Not found.");
  if (req.method !== "GET" && req.method !== "HEAD") return void res.writeHead(405).end();
  await serveUi(p.uiDir, sub, res);
}

async function route(p: Parts, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://cloud.local");
  const path = url.pathname;
  const ctx: Ctx = { req, res, url, params: {}, app: p.app };
  if (path === "/healthz") return void res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
  if (path === "/" || path === BASE) return void res.writeHead(302, { Location: `${BASE}/${url.search}` }).end();
  const signal = otlpSignalOf(path);
  if (signal && req.method === "POST") return ingestOtlp(ctx, signal, p.ingest);
  if (path.startsWith(`${BASE}/`)) return routeBase(p, ctx, path.slice(BASE.length + 1));
  sendJson(res, 404, { error: "Not found." });
}

function onError(err: unknown, res: ServerResponse): void {
  if (res.headersSent) return void res.end();
  if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
  console.error("[wizelens-cloud]", err);
  sendJson(res, 500, { error: "Something went wrong on the server." });
}

function makeApp(db: Db, options: CloudOptions): CloudApp {
  const config = resolveConfig(options);
  return {
    db,
    config,
    version: CLOUD_VERSION,
    startedMs: config.now(),
    baseUrl: (req) => config.publicUrl ?? `${req.headers["x-forwarded-proto"] === "https" ? "https" : "http"}://${req.headers.host ?? "localhost"}`,
  };
}

/** Open the database, bring its schema up to date, and build the server. Call `listen()` to start. */
export async function createCloud(options: CloudOptions = {}): Promise<Cloud> {
  const db = await openDb(resolveConfig(options).database);
  await migrate(db);
  await checkFactsVersion(db);
  const app = makeApp(db, options);
  const parts: Parts = { app, router: allRoutes(), ingest: new RateLimiter(app.config.ingestPerMinute, 60_000, app.config.now), uiDir: resolveUiDir(app.config.uiDir) };
  const server = createServer((req, res) => void route(parts, req, res).catch((err: unknown) => onError(err, res)));
  const stopJobs = startJobs(app);
  return {
    server,
    app,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(app.config.port, app.config.host, () => {
          const { port } = server.address() as AddressInfo;
          resolve(app.config.publicUrl ?? `http://localhost:${port}`);
        });
      }),
    close: async () => {
      stopJobs();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}
