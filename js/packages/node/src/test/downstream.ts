import { createServer, type IncomingHttpHeaders, request, type RequestOptions } from "node:http";
import type { AddressInfo } from "node:net";
import type { Span } from "@wizeworks/lens-core/internal";
import type { WizeLens } from "../types.js";
import { settle } from "./helpers.js";

export interface Downstream {
  base: string;
  port: number;
  /** Headers of the last request per path. */
  seen: Map<string, IncomingHttpHeaders>;
  close(): Promise<void>;
}

/** A plain server for outgoing calls: /fail is a 500, /slow waits, /cut drops the body, /remote reports a WizeLens endpoint. */
export async function startDownstream(): Promise<Downstream> {
  const seen = new Map<string, IncomingHttpHeaders>();
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    seen.set(path, req.headers);
    req.resume();
    if (path === "/slow") return void setTimeout(() => res.end("late"), 500);
    if (path === "/cut") return (res.writeHead(200), res.write("part"), void setTimeout(() => req.socket.destroy(), 20));
    if (path === "/remote") res.setHeader("X-WizeLens-Endpoint", "http://other.test/_wizelens");
    res.writeHead(path === "/fail" ? 500 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ path }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const close = () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r())));
  return { base: `http://127.0.0.1:${port}`, port, seen, close };
}

/** One callback-style http.request: resolves with the status, or the error code. */
export function call(url: string, options: RequestOptions = {}): Promise<number | string> {
  return new Promise((resolve) => {
    const req = request(url, options, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve(res.statusCode ?? 0));
      res.on("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? e.name));
    });
    req.on("error", (e: NodeJS.ErrnoException) => resolve(e.code ?? e.name));
    req.end();
  });
}

/** Call the app, then return the spans of its trace. */
export async function spansOf(wl: WizeLens, url: string): Promise<{ traceId: string; spans: Span[] }> {
  const res = await fetch(url);
  await res.arrayBuffer();
  await settle();
  const traceId = res.headers.get("x-wizelens-trace")!;
  return { traceId, spans: wl.store.get(traceId)?.spans ?? [] };
}

/** The outgoing http spans of a trace. */
export const clientSpans = (spans: Span[]): Span[] => spans.filter((s) => s.category === "http.client");
