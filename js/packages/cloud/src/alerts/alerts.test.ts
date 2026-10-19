import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { setupOwner, startCloud } from "../test/cloud.js";
import { span } from "../test/db.js";
import { checkTarget } from "@wizeworks/lens-hub/kit";
import { evaluateAll } from "./evaluate.js";
import { settleCloud } from "../settle.js";
import { writeChunked } from "../test/scale.js";
import { ANOMALY_NOW, anomalyTraces } from "../../../core/src/testing/anomaly-scenario.js";

let cloud: Cloud;
const closers: (() => void)[] = [];
afterEach(async () => {
  closers.splice(0).forEach((c) => c());
  await cloud?.close();
  cloud = undefined!;
});

/** A webhook receiver on this machine that keeps every body. */
async function receiver(): Promise<{ url: string; bodies: unknown[] }> {
  const bodies: unknown[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (c: Buffer) => (text += c.toString()));
    req.on("end", () => (bodies.push(JSON.parse(text)), res.writeHead(200).end()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  closers.push(() => server.close());
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, bodies };
}

it("fires once when the error rate breaks the rule, then resolves", async () => {
  const clock = { now: 1_800_000_000_000 };
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => clock.now, allowPrivateWebhooks: true, alertIntervalMs: 3_600_000 }));
  const hook = await receiver();
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const rule = { name: "Errors", metric: "error_rate", op: ">", threshold: 10, windowMs: 300_000, channels: [{ kind: "webhook", url: hook.url }] };
  expect((await owner.call("POST", `api/projects/${projectId}/alerts`, rule)).status).toBe(201);
  const failed = span("c".repeat(32), "c".repeat(16), { startMs: clock.now - 60_000, status: "error", attributes: { "http.request.method": "GET", "url.path": "/x", "http.response.status_code": 500 } });
  await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "api" }, spans: [failed] }) });
  await settleCloud(cloud.app.db, clock.now + 10_000);
  await evaluateAll(cloud.app);
  await evaluateAll(cloud.app);
  expect(hook.bodies).toEqual([expect.objectContaining({ state: "fired", rule: "Errors", message: "Error rate is 100% (above 10%)" })]);
  clock.now += 600_000;
  await evaluateAll(cloud.app);
  expect(hook.bodies[1]).toMatchObject({ state: "resolved" });
  const list = await owner.call<{ rules: { state: string }[]; events: { kind: string; delivery: string }[] }>("GET", `api/projects/${projectId}/alerts`);
  expect(list.body.rules[0]!.state).toBe("ok");
  expect(list.body.events.map((e) => e.kind)).toEqual(["resolved", "fired"]);
  expect(list.body.events[0]!.delivery).toBe("webhook: sent");
});

it("an above normal rule fires on a spike, names what broke, and links its problem", async () => {
  const clock = { now: ANOMALY_NOW };
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => clock.now, allowPrivateWebhooks: true, alertIntervalMs: 3_600_000 }));
  const hook = await receiver();
  const { owner, projectId } = await setupOwner(cloud, url);
  const rule = { name: "Checkout p95", metric: "p95_ms", op: "above_normal", threshold: 3, windowMs: 900_000, channels: [{ kind: "webhook", url: hook.url }] };
  expect((await owner.call("POST", `api/projects/${projectId}/alerts`, rule)).status).toBe(201);
  expect((await owner.call("POST", `api/projects/${projectId}/alerts`, { ...rule, metric: "slow_queries" })).status).toBe(400);
  expect((await owner.call("POST", `api/projects/${projectId}/alerts`, { ...rule, threshold: 50 })).status).toBe(400);
  await writeChunked(cloud.app.db, projectId, anomalyTraces(), clock.now);
  await settleCloud(cloud.app.db, clock.now + 10_000);
  clock.now += 10_000;
  await evaluateAll(cloud.app);
  const fired = hook.bodies[0] as { state: string; message: string; baseline: { upper: number }; problem: { title: string; cause: string; url: string } };
  expect(fired).toMatchObject({ state: "fired", rule: "Checkout p95", problem: { title: "Error rate above normal on pay and 2 more", cause: "pay 2.0.0 was released as it started." } });
  expect(fired.message).toMatch(/^p95 duration is above normal on .+ \(normal \d+ ms, alerts above \d+ ms\)$/);
  expect(fired.baseline.upper).toBeGreaterThan(0);
  expect(fired.problem.url).toContain(`/_wizelens/#/problems?project=${projectId}&range=24h&problem=`);
  const list = await owner.call<{ events: { kind: string; problem: { title: string } | null }[] }>("GET", `api/projects/${projectId}/alerts`);
  expect(list.body.events[0]).toMatchObject({ kind: "fired", problem: { title: "Error rate above normal on pay and 2 more" } });
});

it("refuses webhooks into private networks unless allowed", async () => {
  expect(await checkTarget("http://example.com/hook", false)).toBe("Use an https:// URL.");
  expect(await checkTarget("https://127.0.0.1/hook", false)).toMatch(/private/);
  expect(await checkTarget("https://169.254.169.254/latest", false)).toMatch(/private/);
  expect(await checkTarget("http://127.0.0.1/hook", true)).toBeNull();
});

it("changes only the fields a PATCH sends", async () => {
  let url: string;
  ({ cloud, url } = await startCloud({ allowPrivateWebhooks: true, alertIntervalMs: 3_600_000 }));
  const { owner, projectId } = await setupOwner(cloud, url);
  const rule = { name: "Traffic", metric: "requests", op: ">", threshold: 5, windowMs: 900_000, channels: [{ kind: "webhook", url: "http://127.0.0.1:1/hook" }] };
  const made = await owner.call<{ id: string }>("POST", `api/projects/${projectId}/alerts`, rule);
  const changed = await owner.call("PATCH", `api/projects/${projectId}/alerts/${made.body.id}`, { threshold: 1000 });
  expect(changed.status).toBe(200);
  expect(changed.body).toMatchObject({ ...rule, threshold: 1000 });
});
