import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express, { type Express } from "express";
import { newSpanId, type Span } from "@wizeworks/lens-core/internal";
import type { WizeLens } from "../types.js";

export interface Running {
  base: string;
  close(): Promise<void>;
}

export function fakeSpan(traceId: string, startMs: number, attributes: Span["attributes"] = {}): Span {
  return {
    traceId,
    spanId: newSpanId(),
    parentSpanId: null,
    name: "x",
    kind: "server",
    category: "http.server",
    service: "s",
    startMs,
    durationMs: 1,
    status: "unset",
    statusMessage: null,
    attributes,
    events: [],
  };
}

async function listen(server: Server): Promise<Running> {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
}

/** An Express app with WizeLens mounted first and its error middleware last. */
export async function startApp(wizelens: WizeLens, routes: (app: Express) => void): Promise<Running> {
  const app = express();
  app.use(wizelens.middleware);
  routes(app);
  app.use(wizelens.errorMiddleware);
  return listen(createServer(app));
}

/** A fake downstream service: says it has WizeLens data and serves one span for any trace. */
export async function startRemote(): Promise<Running> {
  let base = "";
  const server = createServer((req, res) => {
    const m = /\/_wizelens\/api\/traces\/([0-9a-f]{32})/.exec(req.url ?? "");
    if (m) {
      const span = { ...fakeSpan(m[1]!, Date.now()), service: "remote-api", name: "GET /remote" };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ traceId: m[1], spans: [span], logs: [], remotes: [] }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", "X-WizeLens-Endpoint": `${base}/_wizelens` });
    res.end("{}");
  });
  const running = await listen(server);
  base = running.base;
  return running;
}

export async function getJson<T>(url: string): Promise<T> {
  return (await (await fetch(url)).json()) as T;
}

export const settle = () => new Promise((r) => setTimeout(r, 20));
