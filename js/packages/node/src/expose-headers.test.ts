import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, expect, it } from "vitest";
import { keepExposeHeaders } from "./expose-headers.js";

type Handler = (res: ServerResponse) => void;
const servers: ReturnType<typeof createServer>[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function exposed(handler: Handler): Promise<string | null> {
  const server = createServer((_req, res) => {
    keepExposeHeaders(res);
    handler(res);
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  return res.headers.get("access-control-expose-headers");
}

it("survives a CORS layer that sets the header with setHeader (Express, Koa)", async () => {
  const value = await exposed((res) => {
    res.setHeader("Access-Control-Expose-Headers", "content-disposition");
    res.end("ok");
  });
  expect(value).toBe("content-disposition, X-WizeLens-Trace, X-WizeLens-Endpoint, X-WizeLens-Expected");
});

it("survives headers passed to writeHead (Fastify, Hono)", async () => {
  const asObject = await exposed((res) => res.writeHead(200, { "access-control-expose-headers": "x-a" }).end());
  expect(asObject).toBe("x-a, X-WizeLens-Trace, X-WizeLens-Endpoint, X-WizeLens-Expected");
  const asArray = await exposed((res) => res.writeHead(200, ["Access-Control-Expose-Headers", "x-b"]).end());
  expect(asArray).toBe("x-b, X-WizeLens-Trace, X-WizeLens-Endpoint, X-WizeLens-Expected");
});

it("is added when nobody else sets it", async () => {
  expect(await exposed((res) => res.end("ok"))).toBe("X-WizeLens-Trace, X-WizeLens-Endpoint, X-WizeLens-Expected");
});
