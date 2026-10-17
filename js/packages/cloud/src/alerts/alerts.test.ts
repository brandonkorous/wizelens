import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { setupOwner, startCloud } from "../test/cloud.js";
import { span } from "../test/db.js";
import { checkTarget } from "./notify.js";
import { evaluateAll } from "./evaluate.js";
import { settleCloud } from "../settle.js";

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
  const { owner, orgId, projectId } = await setupOwner(url);
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

it("refuses webhooks into private networks unless allowed", async () => {
  expect(await checkTarget("http://example.com/hook", false)).toBe("Use an https:// URL.");
  expect(await checkTarget("https://127.0.0.1/hook", false)).toMatch(/private/);
  expect(await checkTarget("https://169.254.169.254/latest", false)).toMatch(/private/);
  expect(await checkTarget("http://127.0.0.1/hook", true)).toBeNull();
});
