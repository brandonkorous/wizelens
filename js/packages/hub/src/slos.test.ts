import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateHubAlerts } from "./alerts/evaluate.js";
import { hubAlertDeps } from "./alerts/loop.js";
import type { Hub } from "./hub.js";
import { resolveHubOptions } from "./options.js";
import { settleHub } from "./settle.js";
import { post, span, startHub } from "./test/helpers.js";

let hub: Hub;
const closers: (() => void)[] = [];
afterEach(async () => {
  closers.splice(0).forEach((c) => c());
  await hub?.close();
});

const call = async <T>(url: string, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}/_wizelens/${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
};

async function seed(url: string) {
  const at = Date.now() - 60_000;
  const one = (i: number, status: "ok" | "error", ms: number) =>
    span(i.toString(16).padStart(32, "a"), i.toString(16).padStart(16, "b"), { service: "billing", status, durationMs: ms, startMs: at + i, attributes: { "http.request.method": "GET", "http.route": "/pay", "url.path": "/pay", "http.response.status_code": status === "ok" ? 200 : 500 } });
  const spans = [...Array.from({ length: 8 }, (_, i) => one(i + 1, "ok", i < 6 ? 100 : 3000)), one(20, "error", 50), one(21, "error", 50)];
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "billing", project: "shop" }, spans });
  settleHub(hub.data.store);
}

describe("hub SLOs and Apdex", () => {
  it("reports an SLO's budget and burn rate, and alerts on the burn rate", async () => {
    let url: string;
    ({ hub, url } = await startHub({ alertIntervalMs: 3_600_000 }));
    await seed(url);
    expect((await call<{ capabilities: string[] }>(url, "GET", "api/info")).body.capabilities).toContain("slos");
    const made = await call<{ id: string; name: string }>(url, "POST", "api/slos?project=shop", { service: "billing", kind: "success", target: 90, windowDays: 7 });
    expect(made.body.name).toBe("billing availability");
    const list = await call<{ slos: { status: { total: number; sli: number; budgetLeft: number }; burn1h: number }[] }>(url, "GET", "api/slos?project=shop");
    expect(list.body.slos[0]!.status).toMatchObject({ total: 10, sli: 80 });
    expect(list.body.slos[0]!.status.budgetLeft).toBeCloseTo(-1);
    expect(list.body.slos[0]!.burn1h).toBeCloseTo(2);
    const hook = { bodies: [] as unknown[] };
    const server = createServer((req, res) => (req.on("data", (c: Buffer) => hook.bodies.push(JSON.parse(c.toString()))), req.on("end", () => res.writeHead(200).end())));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    closers.push(() => server.close());
    const rule = { name: "Burn", metric: "slo", sloId: made.body.id, op: ">", threshold: 1.5, windowMs: 3_600_000, channels: [{ kind: "webhook", url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` }] };
    expect((await call(url, "POST", "api/alerts?project=shop", rule)).status).toBe(201);
    expect((await call<{ error: string }>(url, "POST", "api/alerts?project=shop", { ...rule, sloId: "nope" })).body.error).toMatch(/SLO/);
    await evaluateHubAlerts(hubAlertDeps(hub.data.store, resolveHubOptions({}), { url }), Date.now());
    expect(hook.bodies[0]).toMatchObject({ message: "SLO billing availability burns its budget 2.0× as fast as allowed (above 1.5×)" });
  });

  it("scores Apdex against each service's target", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    await seed(url);
    const apdex = async () => (await call<{ apdex: { score: number; targetMs: number } }>(url, "GET", "api/models/service?range=1h&project=shop&service=api:billing")).body.apdex;
    expect(await apdex()).toMatchObject({ targetMs: 500 });
    expect((await apdex()).score).toBeCloseTo(0.6, 1);
    expect((await call(url, "PUT", "api/apdex?project=shop", { apdex: { billing: 5000 } })).status).toBe(200);
    expect((await apdex()).score).toBeCloseTo(0.8, 1);
    expect((await call<{ error: string }>(url, "PUT", "api/apdex?project=shop", { apdex: { billing: 0 } })).body.error).toMatch(/1 to 60000/);
  });
});
