import { createServer, type RequestListener, type Server } from "node:http";
import { createServer as createTlsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseCheckInput, type UptimeCheckInput } from "@wizeworks/lens-core/internal";
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
  if (req.url === "/spa") return void res.writeHead(200, { "Content-Type": "text/html" }).end('<title>BK</title><div id="root"></div><script type="module" src="/a.js"></script>');
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
    expect(await runCheck(check({ url: `${base}/down` }), { allowPrivate: true })).toMatchObject({ ok: false, status: 503, error: "Expected status 200-299, got 503 (failed twice in a row)" });
    expect((await runCheck(check({ url: `${base}/health`, expectBody: "nope" }), { allowPrivate: true })).error).toMatch(/does not contain "nope" \(failed/);
    expect((await runCheck(check({ url: `${base}/spa`, expectBody: "Brandon" }), { allowPrivate: true })).error).toMatch(/does not contain "Brandon"\. This page builds its text with JavaScript/);
    const slow = await runCheck(check({ url: `${base}/slow`, timeoutMs: 1000 }), { allowPrivate: true, confirm: false });
    expect(slow).toMatchObject({ ok: false, status: null, error: `Timed out after 1 s at ${base}/slow (waiting for the first byte)` });
    expect(slow.hops).toEqual([expect.objectContaining({ url: `${base}/slow`, status: null, ttfbMs: null, connectMs: expect.any(Number) })]);
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

describe("runCheck hops and retries", () => {
  it("times each hop of a redirect, and passes when the confirm retry on a fresh connection passes", async () => {
    let calls = 0;
    const base = await serve((req, res) => (req.url === "/old" ? void res.writeHead(301, { Location: "/flaky" }).end() : void res.writeHead(++calls === 1 ? 503 : 200).end("ok")));
    const r = await runCheck(check({ url: `${base}/old` }), { allowPrivate: true });
    expect(r).toMatchObject({ ok: true, status: 200, error: null });
    expect(r.hops?.map((h) => [h.url, h.status])).toEqual([[`${base}/old`, 301], [`${base}/flaky`, 200]]);
    expect(r.hops?.every((h) => h.ttfbMs !== null && h.connectMs !== null)).toBe(true);
  });
});
