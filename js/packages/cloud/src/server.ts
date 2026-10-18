import { createRequire } from "node:module";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { otlpSignalOf } from "@wizeworks/lens-hub/kit";
import { resolveUiDir, serveUi } from "@wizeworks/lens-node/kit";
import type { CloudApp, Ctx } from "./app.js";
import type { WizeAuth } from "./auth/auth.js";
import { authHandler } from "./auth/bridge.js";
import { AUTH_BASE_PATH } from "./auth/options.js";
import { wireAuth } from "./auth/wire.js";
import { type CloudOptions, resolveConfig } from "./config.js";
import { openDb } from "./db/db.js";
import { migrate } from "./db/migrate.js";
import { HttpError, sendJson } from "./http/http.js";
import { RateLimiter } from "./http/limiter.js";
import { Router } from "./http/router.js";
import { startJobs } from "./jobs.js";
import { createMailer } from "./mail/mailer.js";
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
  /** The link that makes the first account, while no account exists. */
  setupLink(): string | null;
  close(): Promise<void>;
}

interface Parts {
  app: CloudApp;
  router: Router<Ctx>;
  ingest: RateLimiter;
  uiDir: string | null;
  auth: () => (req: IncomingMessage, res: ServerResponse) => Promise<void>;
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
  if (path.startsWith(`${AUTH_BASE_PATH}/`)) return p.auth()(req, res);
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

/** Open the database, bring its schema up to date, and build the server. Call `listen()` to start. */
export async function createCloud(options: CloudOptions = {}): Promise<Cloud> {
  const config = resolveConfig(options);
  const db = await openDb(config.database);
  await migrate(db);
  await checkFactsVersion(db);
  const mailer = await createMailer(config);
  const wiring = await wireAuth(db, config, mailer);
  let auth: WizeAuth | undefined;
  let handler: ReturnType<typeof authHandler> | undefined;
  let listenUrl = config.publicUrl ?? `http://localhost:${config.port}`;
  const app: CloudApp = {
    db,
    config,
    version: CLOUD_VERSION,
    startedMs: config.now(),
    mailer,
    get auth(): WizeAuth {
      if (!auth) throw new Error("The cloud is not listening yet.");
      return auth;
    },
    baseUrl: () => config.publicUrl ?? listenUrl,
  };
  const ready = (url: string) => ((listenUrl = url), (auth = wiring.start(url)), (handler = authHandler(auth, config.trustProxy)));
  if (config.publicUrl) ready(config.publicUrl);
  const parts: Parts = { app, router: allRoutes(), ingest: new RateLimiter(config.ingestPerMinute, 60_000, config.now), uiDir: resolveUiDir(config.uiDir), auth: () => handler! };
  const server = createServer((req, res) => void route(parts, req, res).catch((err: unknown) => onError(err, res)));
  const stopJobs = startJobs(app);
  return {
    server,
    app,
    setupLink: wiring.setupLink,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          const { port } = server.address() as AddressInfo;
          if (!config.publicUrl) ready(`http://localhost:${port}`);
          resolve(config.publicUrl ?? `http://localhost:${port}`);
        });
      }),
    close: async () => {
      stopJobs();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await mailer.close();
      await db.close();
    },
  };
}
