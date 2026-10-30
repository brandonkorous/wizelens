import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { newSpanId, newTraceId } from "@wizeworks/lens-core/internal";
import { createWizeLens } from "./index.js";
import { isEnabled, servesDashboard } from "./mode.js";
import { type Running, settle, startApp } from "./test/helpers.js";

const bodies: { sender?: { endpoint?: string } }[] = [];
let hub: Server;
let hubUrl = "";
let app: Running;
let wl: ReturnType<typeof createWizeLens>;

beforeAll(async () => {
  hub = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      bodies.push(JSON.parse(raw || "{}") as (typeof bodies)[number]);
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => hub.listen(0, "127.0.0.1", r));
  hubUrl = `http://127.0.0.1:${(hub.address() as AddressInfo).port}`;
  wl = createWizeLens({ service: "send-only", enabled: true, dashboard: false, mcp: true, endpoint: hubUrl, captureConsole: false, audit: () => {} });
  app = await startApp(wl, (a) => a.get("/hello", (_req, res) => res.json({ ok: true })));
});

afterAll(async () => {
  await wl.shutdown();
  await app.close();
  await new Promise((r) => hub.close(r));
});

describe("send-only (dashboard off)", () => {
  it("answers no reads: dashboard, info, traces, metrics, and MCP", async () => {
    const paths = ["", "/", "/index.html", "/api/info", "/api/traces", `/api/traces/${newTraceId()}`, "/api/metrics/points", "/mcp", "/api/client-spans"];
    for (const p of paths) expect([p, (await fetch(`${app.base}/_wizelens${p}`)).status]).toEqual([p, 404]);
    expect((await fetch(`${app.base}/_wizelens/mcp`, { method: "POST", body: "{}" })).status).toBe(404);
  });

  it("still traces requests and keeps them in memory, not in a file", async () => {
    const res = await fetch(`${app.base}/hello`);
    const traceId = res.headers.get("x-wizelens-trace")!;
    await settle();
    expect(wl.store.get(traceId)?.rootName).toBe("GET /hello");
    expect(wl.storagePath).toBeNull();
  });

  it("takes browser spans", async () => {
    const traceId = newTraceId();
    const span = { traceId, spanId: newSpanId(), name: "pageview /", category: "browser", startMs: Date.now(), attributes: {} };
    expect((await fetch(`${app.base}/_wizelens/api/client-spans`, { method: "OPTIONS" })).status).toBe(204);
    const res = await fetch(`${app.base}/_wizelens/api/client-spans`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ spans: [span] }) });
    expect(res.status).toBe(204);
    expect(wl.store.get(traceId)?.spans).toHaveLength(1);
  });

  it("sends to the hub with no address to read from", async () => {
    await fetch(`${app.base}/hello`);
    await vi.waitFor(() => expect(bodies.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(bodies.every((b) => b.sender?.endpoint === undefined)).toBe(true);
  });
});

describe("mode defaults", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is on with the dashboard outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect([isEnabled({ service: "x" }), servesDashboard({ service: "x" })]).toEqual([true, true]);
  });

  it("is off, and send-only when turned on, in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect([isEnabled({ service: "x" }), servesDashboard({ service: "x", enabled: true })]).toEqual([false, false]);
  });

  it("says so when production keeps it off while a hub is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(createWizeLens({ service: "x", endpoint: "http://localhost:5970" }).enabled).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Set WIZELENS_ENABLED=true"));
    warn.mockClear();
    createWizeLens({ service: "x", endpoint: "http://localhost:5970", enabled: false });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reads WIZELENS_ENABLED and WIZELENS_DASHBOARD, and options win over them", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WIZELENS_ENABLED", "true");
    vi.stubEnv("WIZELENS_DASHBOARD", "yes");
    expect([isEnabled({ service: "x" }), servesDashboard({ service: "x" })]).toEqual([true, true]);
    expect([isEnabled({ service: "x", enabled: false }), servesDashboard({ service: "x", dashboard: false })]).toEqual([false, false]);
    vi.stubEnv("WIZELENS_ENABLED", "maybe");
    expect(isEnabled({ service: "x" })).toBe(false);
  });
});
