import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { settleCloud } from "../settle.js";
import { setupOwner, startCloud } from "../test/cloud.js";
import { span } from "../test/db.js";
import { evaluateAll } from "./evaluate.js";

let cloud: Cloud;
const closers: (() => void)[] = [];
afterEach(async () => {
  closers.splice(0).forEach((c) => c());
  await cloud?.close();
  cloud = undefined!;
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

const failed = (id: string, at: number, route: string) =>
  span(id.repeat(32), id.repeat(16), { service: "api", startMs: at, status: "error", attributes: { "http.request.method": "GET", "http.route": route, "url.path": route, "http.response.status_code": 500 } });

async function start(pd: string) {
  const clock = { now: 1_800_000_000_000 };
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => clock.now, allowPrivateTargets: true, alertIntervalMs: 3_600_000, pagerDutyUrl: pd }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const send = (spans: unknown[]) => fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "api" }, spans }) });
  const tick = async () => (await settleCloud(cloud.app.db, clock.now + 10_000), await evaluateAll(cloud.app));
  return { clock, owner, projectId, send, tick, base: `api/projects/${projectId}/alerts` };
}

it("watches one endpoint, reminds until acknowledged, stays quiet while muted, and keeps a history", async () => {
  const [hook, pd] = [await receiver(), await receiver()];
  const t = await start(pd.url);
  const channels = [{ kind: "teams", url: hook.url }, { kind: "pagerduty", routingKey: "R0UTINGKEY0123456789abcd" }];
  const rule = { name: "Pay", metric: "error_rate", op: ">=", threshold: 50, windowMs: 900_000, service: "api", endpoint: "GET /pay", remindMs: 900_000, channels };
  const id = (await t.owner.call<{ id: string }>("POST", t.base, rule)).body.id;
  await t.send([failed("a", t.clock.now - 60_000, "/other")]);
  await t.tick();
  expect(hook.bodies).toEqual([]);
  await t.send([failed("b", t.clock.now - 30_000, "/pay")]);
  await t.tick();
  expect(hook.bodies[0]).toMatchObject({ "@type": "MessageCard", title: "Alert: Pay (My app)" });
  expect(pd.bodies[0]).toMatchObject({ event_action: "trigger", dedup_key: `wizelens-${id}` });
  t.clock.now += 900_000;
  await t.send([failed("c", t.clock.now - 30_000, "/pay")]);
  await t.tick();
  expect(hook.bodies[1]).toMatchObject({ title: "Still firing: Pay (My app)" });
  t.clock.now += 1000;
  expect((await t.owner.call("POST", `${t.base}/${id}/ack`)).status).toBe(200);
  t.clock.now += 900_000;
  await t.send([failed("d", t.clock.now - 30_000, "/pay")]);
  await t.tick();
  expect(hook.bodies).toHaveLength(2);
  expect((await t.owner.call("POST", `${t.base}/${id}/mute`, { untilMs: -1 })).status).toBe(200);
  t.clock.now += 3_600_000;
  await t.tick();
  expect(hook.bodies).toHaveLength(2);
  const one = await t.owner.call<{ rule: { state: string; mutedUntilMs: number }; events: { kind: string }[]; values: unknown[] }>("GET", `${t.base}/${id}?from=0`);
  expect(one.body.rule.state).toBe("ok");
  expect(one.body.events.map((e) => e.kind)).toEqual(["mute", "ack", "remind", "fired"]);
  const paged = await t.owner.call<{ events: { kind: string }[]; eventCount: number }>("GET", `${t.base}/${id}?from=0&epage=2`);
  expect(paged.body).toMatchObject({ events: [], eventCount: 4 });
  expect(one.body.values.length).toBe(4);
}, 60_000);

it("refuses scopes that do not fit, bad routing keys, and bad operators", async () => {
  const t = await start("http://127.0.0.1:1");
  const base = { name: "x", metric: "slow_queries", op: ">", threshold: 1, windowMs: 300_000 };
  expect((await t.owner.call<{ error: string }>("POST", t.base, { ...base, service: "api", endpoint: "GET /x" })).body.error).toMatch(/per service/);
  expect((await t.owner.call<{ error: string }>("POST", t.base, { ...base, metric: "requests", endpoint: "GET /x" })).body.error).toMatch(/needs its service/);
  expect((await t.owner.call<{ error: string }>("POST", t.base, { ...base, channels: [{ kind: "pagerduty", routingKey: "short" }] })).body.error).toMatch(/routing key/);
  expect((await t.owner.call<{ error: string }>("POST", t.base, { ...base, op: "=" })).body.error).toMatch(/op/);
}, 60_000);
