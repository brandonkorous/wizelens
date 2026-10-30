import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import type { StatusPageView, UptimeCheck, UptimeList, UptimeModel } from "@wizeworks/lens-core/internal";
import type { Cloud } from "../server.js";
import { settleCloud } from "../settle.js";
import { Client, invite, joinWithInvite, setupOwner, startCloud } from "../test/cloud.js";
import { runUptime } from "./run.js";

let cloud: Cloud;
let target: Server;
afterEach(async () => {
  target?.close();
  await cloud?.close();
  cloud = undefined!;
});

async function site(): Promise<{ url: string; state: { down: boolean } }> {
  const state = { down: false };
  target = createServer((_req, res) => res.writeHead(state.down ? 503 : 200).end("ok"));
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(target.address() as AddressInfo).port}/health`, state };
}

it("runs checks as jobs, keeps incidents, encrypts headers, and writes results as spans", async () => {
  const clock = { now: Date.UTC(2026, 9, 19, 12) };
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => clock.now, allowPrivateTargets: true, jobs: false }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const { url: siteUrl, state } = await site();
  const base = `api/projects/${projectId}/uptime`;
  const made = await owner.call<UptimeCheck>("POST", base, { name: "API", url: siteUrl, intervalMin: 1, headers: { Authorization: "Bearer t0k" } });
  expect(made.status).toBe(201);
  expect(made.body.headers).toEqual({ Authorization: "[redacted]" });
  const [stored] = await cloud.app.db.query<{ headers: string }>("SELECT headers FROM uptime_checks");
  expect(stored!.headers).toMatch(/^v\d+:/);
  expect(await runUptime(cloud.app)).toBe(1);
  expect(await runUptime(cloud.app)).toBe(0);
  state.down = true;
  clock.now += 60_000;
  expect(await runUptime(cloud.app)).toBe(1);
  clock.now += 60_000;
  const list = (await owner.call<UptimeList>("GET", base)).body;
  expect(list.checks[0]).toMatchObject({ state: "down", lastStatus: 503 });
  expect(list.incidents).toEqual([expect.objectContaining({ checkName: "API", endMs: null })]);
  await settleCloud(cloud.app.db, clock.now + 60_000);
  const model = (await owner.call<UptimeModel>("GET", `api/models/uptime?project=${projectId}&range=1h`)).body;
  expect(model.checks).toEqual([expect.objectContaining({ checkId: made.body.id, runs: 2, failures: 1 })]);
  const audit = (await owner.call<{ entries: { action: string }[] }>("GET", `api/orgs/${orgId}/audit`)).body;
  expect(JSON.stringify(audit)).toContain("uptime.create");
});

it("lets members change checks, not viewers, and refuses private addresses", async () => {
  let url: string;
  ({ cloud, url } = await startCloud({ jobs: false }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const base = `api/projects/${projectId}/uptime`;
  expect((await owner.call<{ error: string }>("POST", base, { url: "http://127.0.0.1:9/health" })).body.error).toMatch(/private or local/);
  expect((await owner.call("POST", base, { url: "http://169.254.169.254/latest" })).status).toBe(400);
  const viewer = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "viewer"), "vic@acme.io");
  expect((await viewer.call("POST", base, { url: "https://example.com" })).status).toBe(403);
  expect((await viewer.call("GET", base)).status).toBe(200);
});

it("serves a public status page by an unguessable link, without URLs or errors", async () => {
  const clock = { now: Date.UTC(2026, 9, 19, 12) };
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => clock.now, allowPrivateTargets: true, jobs: false }));
  const { owner, projectId } = await setupOwner(cloud, url);
  const { url: siteUrl } = await site();
  await owner.call("POST", `api/projects/${projectId}/uptime`, { name: "Website", url: siteUrl });
  await runUptime(cloud.app);
  clock.now += 60_000;
  const page = `api/projects/${projectId}/status-page`;
  expect((await owner.call("GET", page)).body).toEqual({ enabled: false });
  const made = await owner.call<{ url: string }>("POST", page, { title: "Acme status" });
  const token = made.body.url.split("#/status/")[1]!;
  expect(token).toMatch(/^wl_st_/);
  const anyone = new Client(url);
  const view = (await anyone.call<StatusPageView>("GET", `api/status/${token}`)).body;
  expect(view).toMatchObject({ title: "Acme status", checks: [{ name: "Website", state: "up", uptime: { "24h": 100 } }] });
  expect(JSON.stringify(view)).not.toContain(siteUrl);
  const again = await owner.call<{ url: string }>("POST", page, {});
  expect((await anyone.call("GET", `api/status/${token}`)).status).toBe(404);
  expect((await owner.call("DELETE", page)).status).toBe(200);
  expect((await anyone.call("GET", `api/status/${again.body.url.split("#/status/")[1]}`)).status).toBe(404);
});
