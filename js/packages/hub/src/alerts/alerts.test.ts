import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Hub } from "../hub.js";
import { resolveHubOptions } from "../options.js";
import { settleHub } from "../settle.js";
import { post, span, startHub } from "../test/helpers.js";
import { evaluateHubAlerts } from "./evaluate.js";
import { hubAlertDeps } from "./loop.js";
import { listEvents, ruleEvents } from "./store.js";

let hub: Hub;
const closers: (() => void)[] = [];
afterEach(async () => {
  closers.splice(0).forEach((c) => c());
  await hub?.close();
});

async function receiver(): Promise<{ url: string; bodies: Record<string, unknown>[] }> {
  const bodies: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (c: Buffer) => (text += c.toString()));
    req.on("end", () => (bodies.push(JSON.parse(text) as Record<string, unknown>), res.writeHead(200).end()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  closers.push(() => server.close());
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, bodies };
}

const call = async <T>(url: string, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}/_wizelens/${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
};

describe("hub alerts", () => {
  it("fires through Discord for one service, resolves, and keeps a history", async () => {
    let url: string;
    ({ hub, url } = await startHub({ alertIntervalMs: 3_600_000 }));
    const hook = await receiver();
    expect((await call<{ capabilities: string[] }>(url, "GET", "api/info")).body.capabilities).toContain("alerts");
    const rule = { name: "Billing errors", metric: "error_rate", op: ">", threshold: 10, windowMs: 300_000, service: "billing", channels: [{ kind: "discord", url: hook.url }] };
    const made = await call<{ id: string }>(url, "POST", "api/alerts?project=shop", rule);
    expect(made.status).toBe(201);
    const attrs = { "http.request.method": "GET", "url.path": "/pay", "http.response.status_code": 500 };
    const failed = (id: string, service: string) => span("a".repeat(31) + id, id.repeat(16), { status: "error", service, startMs: Date.now() - 60_000, attributes: attrs });
    await post(`${url}/_wizelens/api/ingest`, { sender: { service: "orders", project: "shop" }, spans: [failed("1", "orders")] });
    settleHub(hub.data.store);
    const deps = hubAlertDeps(hub.data.store, resolveHubOptions({}), { url });
    await evaluateHubAlerts(deps, Date.now());
    expect(hook.bodies).toEqual([]);
    await post(`${url}/_wizelens/api/ingest`, { sender: { service: "billing", project: "shop" }, spans: [failed("2", "billing")] });
    settleHub(hub.data.store);
    await evaluateHubAlerts(deps, Date.now());
    expect(hook.bodies[0]).toMatchObject({ content: expect.stringContaining("**Alert: Billing errors (shop)**") });
    expect((await call(url, "POST", `api/alerts/${made.body.id}/ack?project=shop`)).status).toBe(200);
    const one = await call<{ rule: { state: string; ackMs: number }; events: { kind: string }[]; values: unknown[] }>(url, "GET", `api/alerts/${made.body.id}?project=shop`);
    expect(one.body.rule).toMatchObject({ state: "firing", ackMs: expect.any(Number) });
    expect(one.body.events.map((e) => e.kind)).toEqual(["ack", "fired"]);
    expect(one.body.values).toHaveLength(2);
    const paged = await call<{ events: { kind: string }[]; eventCount: number }>(url, "GET", `api/alerts/${made.body.id}?project=shop&epage=2`);
    expect(paged.body).toMatchObject({ events: [], eventCount: 2 });
    expect((await call<{ eventCount: number }>(url, "GET", "api/alerts?project=shop")).body.eventCount).toBe(2);
    expect(listEvents(hub.data.store.db, "shop", 1, 1).map((e) => e.kind)).toEqual(["fired"]);
    expect(ruleEvents(hub.data.store.db, made.body.id, 5, 1).map((e) => e.kind)).toEqual(["fired"]);
    expect((await call<{ rules: unknown[] }>(url, "GET", "api/alerts?project=other")).body.rules).toEqual([]);
  });

  it("refuses email (the hub sends none) and a bad window", async () => {
    let url: string;
    ({ hub, url } = await startHub({ alertIntervalMs: 3_600_000 }));
    const base = { name: "x", metric: "requests", op: "<", threshold: 1, windowMs: 300_000 };
    expect((await call<{ error: string }>(url, "POST", "api/alerts", { ...base, channels: [{ kind: "email", to: ["a@b.c"] }] })).body.error).toMatch(/no email/);
    expect((await call<{ error: string }>(url, "POST", "api/alerts", { ...base, windowMs: 1 })).body.error).toMatch(/window/);
    expect((await call(url, "POST", "api/alerts/nope/mute", { untilMs: -1 })).status).toBe(404);
  });
});
