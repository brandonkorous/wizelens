import { createServer, type RequestListener, type Server } from "node:http";
import { createServer as createTlsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseCheckInput, type UptimeCheckInput } from "@wizeworks/lens-core";
import { TEST_CERT, TEST_CERT_END, TEST_KEY } from "../test/tls.js";
import { isPrivateAddress } from "./guard.js";
import { runCheck } from "./run.js";

const servers: Server[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function serve(handler: RequestListener, tls = false): Promise<string> {
  const server = tls ? createTlsServer({ key: TEST_KEY, cert: TEST_CERT }, handler) : createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return `${tls ? "https" : "http"}://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const check = (over: Partial<UptimeCheckInput>): UptimeCheckInput => {
  const r = parseCheckInput({ timeoutMs: 2000, ...over });
  if (!r.ok) throw new Error(r.error);
  return r.input;
};

const app: RequestListener = (req, res) => {
  if (req.url === "/old") return void res.writeHead(301, { Location: "/health" }).end();
  if (req.url === "/slow") return void setTimeout(() => res.end("late"), 3000);
  if (req.url === "/down") return void res.writeHead(503).end("busy");
  res.writeHead(200, { "Content-Type": "text/plain" }).end(`ok from ${req.headers["x-probe"] ?? "nobody"}`);
};

describe("runCheck", () => {
  it("passes on the expected status and body, with the headers sent", async () => {
    const base = await serve(app);
    const r = await runCheck(check({ url: `${base}/health`, headers: { "X-Probe": "wl" }, expectBody: "ok from wl" }), { allowPrivate: true });
    expect(r).toMatchObject({ ok: true, status: 200, error: null, tlsExpiresMs: null });
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fails on a wrong status, missing text, or a timeout", async () => {
    const base = await serve(app);
    expect(await runCheck(check({ url: `${base}/down` }), { allowPrivate: true })).toMatchObject({ ok: false, status: 503, error: "Expected status 200-299, got 503" });
    expect((await runCheck(check({ url: `${base}/health`, expectBody: "nope" }), { allowPrivate: true })).error).toMatch(/does not contain "nope"/);
    expect(await runCheck(check({ url: `${base}/slow`, timeoutMs: 1000 }), { allowPrivate: true })).toMatchObject({ ok: false, status: null, error: "Timed out after 1 s" });
  });

  it("follows redirects unless a 3xx is expected", async () => {
    const base = await serve(app);
    expect(await runCheck(check({ url: `${base}/old` }), { allowPrivate: true })).toMatchObject({ ok: true, status: 200, finalUrl: `${base}/health` });
    expect(await runCheck(check({ url: `${base}/old`, expectStatus: "301" }), { allowPrivate: true })).toMatchObject({ ok: true, status: 301 });
  });

  it("refuses private addresses unless they are allowed", async () => {
    const base = await serve(app);
    expect((await runCheck(check({ url: `${base}/health` }), { allowPrivate: false })).error).toMatch(/private or local/);
    const named = base.replace("127.0.0.1", "localhost");
    expect((await runCheck(check({ url: `${named}/health` }), { allowPrivate: false })).error).toMatch(/private or local/);
    expect(["10.1.2.3", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"].every(isPrivateAddress)).toBe(true);
    expect(isPrivateAddress("93.184.215.14")).toBe(false);
  });

  it("reads when the certificate ends, also when the certificate is refused", async () => {
    const base = await serve(app, true);
    const trusted = await runCheck(check({ url: `${base}/health` }), { allowPrivate: true, ca: TEST_CERT });
    expect(trusted).toMatchObject({ ok: true, tlsExpiresMs: TEST_CERT_END });
    const refused = await runCheck(check({ url: `${base}/health` }), { allowPrivate: true });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/^The TLS certificate is not valid/);
    expect(refused.tlsExpiresMs).toBe(TEST_CERT_END);
  });
});
