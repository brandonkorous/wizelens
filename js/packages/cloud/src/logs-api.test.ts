import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { isLooseTraceId, type LogRecord, newLooseTraceId, type SavedSearch } from "@wizeworks/lens-core";
import { evaluateAll } from "./alerts/evaluate.js";
import type { Cloud } from "./server.js";
import { settleCloud } from "./settle.js";
import { setupOwner, startCloud } from "./test/cloud.js";
import { span } from "./test/db.js";

let cloud: Cloud;
const closers: (() => void)[] = [];
afterEach(async () => {
  closers.splice(0).forEach((c) => c());
  await cloud?.close();
  cloud = undefined!;
});

async function receiver(): Promise<{ url: string; bodies: { message: string; state: string }[] }> {
  const bodies: { message: string; state: string }[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (c: Buffer) => (text += c.toString()));
    req.on("end", () => (bodies.push(JSON.parse(text)), res.writeHead(200).end()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  closers.push(() => server.close());
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`, bodies };
}

const line = (timeMs: number, level: LogRecord["level"], message: string): LogRecord => ({ timeMs, level, category: "jobs", message, service: "worker", spanId: null, attributes: {} });

async function setup(clock: { now: number }) {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => clock.now, allowPrivateWebhooks: true, alertIntervalMs: 3_600_000 }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const ingest = (body: unknown) => fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  return { owner, orgId, projectId, ingest };
}

it("alerts on the count of a log search, and lists lines outside a request as logs, not traces", async () => {
  const clock = { now: 1_800_000_000_000 };
  const { owner, projectId, ingest } = await setup(clock);
  const hook = await receiver();
  const loose = newLooseTraceId();
  const logs = [line(clock.now - 60_000, "error", "Job 7 timed out"), line(clock.now - 50_000, "error", "Job 8 timed out"), line(clock.now - 40_000, "info", "Job 9 done")];
  await ingest({ sender: { service: "worker" }, spans: [span("d".repeat(32), "d".repeat(16), { startMs: clock.now - 60_000 })], logs: logs.map((log) => ({ traceId: loose, log })) });
  const rule = { name: "Timeouts", metric: "log_count", logSearch: { level: "error", q: "timed out", junk: "x" }, op: ">", threshold: 1, windowMs: 300_000, channels: [{ kind: "webhook", url: hook.url }] };
  const made = await owner.call<{ logSearch: Record<string, string> }>("POST", `api/projects/${projectId}/alerts`, rule);
  expect([made.status, made.body.logSearch]).toEqual([201, { level: "error", q: "timed out" }]);
  await settleCloud(cloud.app.db, clock.now + 10_000);
  await evaluateAll(cloud.app);
  expect(hook.bodies).toEqual([expect.objectContaining({ state: "fired", message: 'Log lines (error and up, "timed out") is 2 (above 1)' })]);
  const list = await owner.call<{ traceId: string }[]>("GET", `api/traces?project=${projectId}`);
  expect(list.body.map((t) => t.traceId)).toEqual(["d".repeat(32)]);
  const full = await owner.call<{ traceId: string }[]>("GET", `api/traces?project=${projectId}&full=true`);
  expect(full.body.some((t) => isLooseTraceId(t.traceId))).toBe(true);
});

it("sets a project's log retention and keeps saved searches per project", async () => {
  const { owner, orgId, projectId } = await setup({ now: Date.now() });
  const patch = (days: unknown) => owner.call<{ logRetentionDays: number | null }>("PATCH", `api/orgs/${orgId}/projects/${projectId}`, { logRetentionDays: days });
  expect((await patch(7)).body.logRetentionDays).toBe(7);
  expect((await patch(0)).status).toBe(400);
  const listed = await owner.call<{ projects: { id: string; logRetentionDays: number | null }[] }>("GET", `api/orgs/${orgId}`);
  expect(listed.body.projects.find((p) => p.id === projectId)?.logRetentionDays).toBe(7);
  expect((await patch(null)).body.logRetentionDays).toBeNull();
  const api = `api/projects/${projectId}/saved-searches`;
  const made = await owner.call<{ search: SavedSearch }>("POST", api, { name: "Errors", params: { level: "error" } });
  expect(made.body.search).toMatchObject({ kind: "logs", name: "Errors", params: { level: "error" } });
  expect((await owner.call<{ searches: SavedSearch[] }>("GET", `${api}?kind=logs`)).body.searches.map((s) => s.name)).toEqual(["Errors"]);
  expect((await owner.call("DELETE", `${api}/${made.body.search.id}`)).status).toBe(200);
  expect((await owner.call("DELETE", `${api}/${made.body.search.id}`)).status).toBe(404);
});
