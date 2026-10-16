import { createRequire } from "node:module";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { handleMcp, resolveUiDir, sendJson, serveUi, setCors } from "@wizeworks/lens-node/kit";
import { parseJson, readBody } from "./body.js";
import { acceptTokenLink, deny, isAllowed } from "./auth.js";
import { type ApiContext, handleApi } from "./api.js";
import { HubData } from "./data.js";
import { hubMcpSource } from "./mcp.js";
import { type HubOptions, resolveHubOptions } from "./options.js";
import { handleOtlp, otlpSignalOf } from "./otlp/index.js";
import { HubStore } from "./store.js";

const require = createRequire(import.meta.url);
export const HUB_VERSION: string = (require("../package.json") as { version: string }).version;
const BASE = "/_wizelens";
const PRUNE_MS = 60_000;

export interface Hub {
  readonly server: Server;
  readonly data: HubData;
  /** Start listening. Resolves to the hub's base URL. */
  listen(): Promise<string>;
  close(): Promise<void>;
}

interface Ctx extends ApiContext {
  uiDir: string | null;
}

async function routeBase(c: Ctx, sub: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? "GET";
  if (sub.startsWith("api/")) return handleApi(c, sub, req, res, url);
  if (sub === "mcp") {
    if (!c.o.enableMcp) return sendJson(res, 404, { error: "MCP is off. Start the hub with --mcp." });
    const body = method === "POST" ? parseJson(await readBody(req)) : undefined;
    return handleMcp(hubMcpSource(c.data, c.o.name, c.version, c.o.audit), req, res, body);
  }
  if (method !== "GET" && method !== "HEAD") return void res.writeHead(405).end();
  if (acceptTokenLink(url, c.o.token, res)) return;
  if (!isAllowed(req, c.o.token)) return deny(res, false, url);
  await serveUi(c.uiDir, sub, res);
}

async function route(c: Ctx, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://hub.local");
  const path = url.pathname;
  setCors(res);
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  if (path === "/healthz") return void res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
  if (path === "/" || path === BASE) return void res.writeHead(302, { Location: `${BASE}/${url.search}` }).end();
  const signal = otlpSignalOf(path);
  const isUi = path.startsWith(`${BASE}/`) && !path.startsWith(`${BASE}/api/`) && path !== `${BASE}/mcp`;
  if (!isUi && !isAllowed(req, c.o.token)) return deny(res, true, url);
  if (signal && req.method === "POST") return handleOtlp(signal, req, res, (w) => c.data.write(w), c.o.redactKeys);
  if (path.startsWith(`${BASE}/`)) return routeBase(c, path.slice(BASE.length + 1), req, res, url);
  sendJson(res, 404, { error: "not found" });
}

/** Create the local hub: one place for the traces of every service, with the dashboard, the API, OTLP, and MCP. */
export function createHub(options: HubOptions = {}): Hub {
  const o = resolveHubOptions(options);
  const store = new HubStore({ path: o.storagePath === "memory" ? ":memory:" : o.storagePath, maxTraces: o.maxTraces, maxAgeMs: o.maxAgeMs, now: o.now });
  const data = new HubData(store);
  const c: Ctx = { data, o, version: HUB_VERSION, startedMs: o.now(), uiDir: resolveUiDir(o.uiDir) };
  const server = createServer((req, res) => {
    route(c, req, res).catch(() => !res.headersSent && sendJson(res, 500, { error: "internal error" }));
  });
  store.prune();
  const timer = setInterval(() => store.prune(), PRUNE_MS);
  timer.unref();
  return {
    server,
    data,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(o.port, o.host, () => {
          const { port } = server.address() as AddressInfo;
          const local = ["0.0.0.0", "::", "127.0.0.1", "::1"].includes(o.host);
          resolve(`http://${local ? "localhost" : o.host}:${port}`);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        clearInterval(timer);
        server.closeAllConnections?.();
        server.close(() => (store.close(), resolve()));
      }),
  };
}
