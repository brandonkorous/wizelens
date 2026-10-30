import { createRequire } from "node:module";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { PACKAGES_PATH, SOURCEMAPS_PATH } from "@wizeworks/lens-core/internal";
import { otlpSignalOf } from "@wizeworks/lens-hub/internal";
import { resolveUiDir, serveUi } from "@wizeworks/lens-node/internal";
import type { CloudApp, Ctx } from "./app.js";
import type { WizeAuth } from "./auth/auth.js";
import { authHandler } from "./auth/bridge.js";
import { AUTH_BASE_PATH } from "./auth/options.js";
import { wireAuth } from "./auth/wire.js";
import { createBilling } from "./billing/service.js";
import { STRIPE_WEBHOOK_PATH, stripeWebhook } from "./billing/webhook.js";
import { Changes } from "./changes.js";
import { SettingsCache } from "./repo/settings.js";
import { type CloudConfig, type CloudOptions, resolveConfig } from "./config.js";
import { openDb } from "./db/db.js";
import { migrate } from "./db/migrate.js";
import { HttpError, sendJson } from "./http/http.js";
import { RateLimiter } from "./http/limiter.js";
import { Router } from "./http/router.js";
import { startJobs } from "./jobs.js";
import { createMailer } from "./mail/mailer.js";
import { stopRoute } from "./mail/stop-route.js";
import { UNSUBSCRIBE_PATH } from "./mail/unsubscribe.js";
import { RESEND_WEBHOOK_PATH, resendWebhook } from "./mail/webhook.js";
import { openTelemetry } from "./telemetry/index.js";
import { allRoutes } from "./routes/index.js";
import { browserKeyOf, ingestBrowser } from "./routes/browser.js";
import { ingestBatch, ingestOtlp } from "./routes/ingest.js";
import { ingestPackages } from "./routes/packages.js";
import { listProjectMaps, uploadSourceMap } from "./routes/sourcemaps.js";
import { cloudMapLoaders } from "./repo/sourcemaps.js";
import { serveOAuthMetadata } from "./routes/oauth-meta.js";
import { forgetModels } from "./routes/models.js";

const require = createRequire(import.meta.url);
export const CLOUD_VERSION: string = (require("../package.json") as { version: string }).version;
const BASE = "/_wizelens";
/** A page sends about once a second while open; this leaves room for a few tabs per visitor. */
const VISITOR_PER_MINUTE = 300;

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
  /** Browser keys: per visitor, on top of the per-key cap. */
  visitor: RateLimiter;
  uiDir: string | null;
  auth: () => (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

/** Changes from a browser must carry the dashboard header, so a page on another site cannot send them. */
const needsClientHeader = (req: IncomingMessage, sub: string) =>
  req.method !== "GET" && req.method !== "HEAD" && !req.headers.authorization && sub.startsWith("api/") && sub !== "api/ingest" && sub !== PACKAGES_PATH;

async function routeBase(p: Parts, ctx: Ctx, sub: string): Promise<void> {
  const { req, res } = ctx;
  if (sub === "api/ingest" && req.method === "POST") return ingestBatch(ctx, p.ingest);
  // Pages on a key's sites post with a public browser key, from another origin.
  const browserKey = browserKeyOf(sub);
  if (browserKey) return ingestBrowser(ctx, browserKey, { key: p.ingest, visitor: p.visitor });
  if (sub === PACKAGES_PATH && req.method === "POST") return ingestPackages(ctx, p.ingest);
  // Build tools upload source maps with the project's ingest key.
  if (sub === SOURCEMAPS_PATH && req.method === "POST") return uploadSourceMap(ctx, p.ingest);
  if (sub === SOURCEMAPS_PATH && req.method === "GET") return listProjectMaps(ctx, p.ingest);
  // Resend signs its webhook, so it needs no dashboard header.
  if (sub === RESEND_WEBHOOK_PATH && req.method === "POST") return resendWebhook(ctx);
  // Stop links come from mail apps (RFC 8058 one-click POST), with the signed token as the only proof.
  if (sub === UNSUBSCRIBE_PATH && (req.method === "GET" || req.method === "POST")) return stopRoute(ctx);
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
  if (path === STRIPE_WEBHOOK_PATH && req.method === "POST") return stripeWebhook(p.app, req, res);
  if (path.startsWith(`${AUTH_BASE_PATH}/`)) return p.auth()(req, res);
  if (path.startsWith("/.well-known/") && (await serveOAuthMetadata(p.app, req, res, path))) return;
  const signal = otlpSignalOf(path);
  if (signal && req.method === "POST") return ingestOtlp(ctx, signal, p.ingest);
  if (path.startsWith(`${BASE}/`)) return routeBase(p, ctx, path.slice(BASE.length + 1));
  sendJson(res, 404, { error: "Not found." });
}

function onError(err: unknown, res: ServerResponse): void {
  if (res.headersSent) return void res.end();
  if (err instanceof HttpError) return sendJson(res, err.status, { ...err.extra, error: err.message });
  console.error("[wizelens-cloud]", err);
  sendJson(res, 500, { error: "Something went wrong on the server." });
}

/** The database (migrated), the telemetry store (its stats rebuilt when the facts version changed), and the new-data signal. */
async function openStores(config: CloudConfig) {
  const db = await openDb(config.database);
  await migrate(db);
  const settings = new SettingsCache(db);
  const telemetry = await openTelemetry(config, db, settings);
  await telemetry.checkFactsVersion();
  const changes = new Changes();
  changes.onAny(forgetModels);
  return { db, telemetry, changes, maps: cloudMapLoaders(db), settings };
}

/** Mail, plans and usage (Stripe with billing on), and the auth wiring. */
async function openServices(config: CloudConfig, db: Awaited<ReturnType<typeof openDb>>) {
  const mailer = await createMailer(config, db);
  const billing = await createBilling(config, db);
  return { mailer, billing, wiring: await wireAuth(db, config, mailer, billing.stripe) };
}

/** Open the database, bring its schema up to date, and build the server. Call `listen()` to start. */
export async function createCloud(options: CloudOptions = {}): Promise<Cloud> {
  const config = resolveConfig(options);
  const stores = await openStores(config);
  const { db, telemetry } = stores;
  const { mailer, billing, wiring } = await openServices(config, db);
  let [auth, handler]: [WizeAuth | undefined, ReturnType<typeof authHandler> | undefined] = [undefined, undefined];
  let listenUrl = config.publicUrl ?? `http://localhost:${config.port}`;
  const app: CloudApp = {
    ...stores,
    config,
    version: CLOUD_VERSION,
    startedMs: config.now(),
    mailer,
    billing,
    secrets: wiring.secrets,
    get auth(): WizeAuth {
      if (!auth) throw new Error("The cloud is not listening yet.");
      return auth;
    },
    baseUrl: () => config.publicUrl ?? listenUrl,
  };
  const ready = (url: string) => ((listenUrl = url), (auth = wiring.start(url)), (handler = authHandler(auth, config.trustProxy)));
  if (config.publicUrl) ready(config.publicUrl);
  const parts: Parts = { app, router: allRoutes(), ingest: new RateLimiter(config.ingestPerMinute, 60_000, config.now), visitor: new RateLimiter(VISITOR_PER_MINUTE, 60_000, config.now), uiDir: resolveUiDir(config.uiDir), auth: () => handler! };
  const server = createServer((req, res) => void route(parts, req, res).catch((err: unknown) => onError(err, res)));
  const stopJobs = config.jobs ? startJobs(app) : () => {};
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
      await billing.usage.flush().catch((err: unknown) => console.error("[wizelens-cloud] usage flush failed:", err));
      await mailer.close();
      await telemetry.close();
      await db.close();
    },
  };
}
