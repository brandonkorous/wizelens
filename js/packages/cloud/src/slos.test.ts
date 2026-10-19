import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { settleCloud } from "./settle.js";
import { invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";
import { span } from "./test/db.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

describe("cloud SLOs and Apdex", () => {
  it("reports SLOs, keeps Apdex targets, lets only writers change them, and checks burn-rate rules", async () => {
    const clock = { now: 1_800_000_000_000 };
    let url: string;
    ({ cloud, url } = await startCloud({ now: () => clock.now, alertIntervalMs: 3_600_000 }));
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
    const one = (i: number, ok: boolean, ms: number) =>
      span(String(i).padStart(32, "a"), String(i).padStart(16, "b"), { service: "api", durationMs: ms, startMs: clock.now - 60_000 + i, status: ok ? "ok" : "error", attributes: { "http.request.method": "GET", "http.route": "/x", "url.path": "/x", "http.response.status_code": ok ? 200 : 500 } });
    const spans = [one(1, true, 100), one(2, true, 100), one(3, true, 3000), one(4, false, 50)];
    await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "api" }, spans }) });
    await settleCloud(cloud.app.db, clock.now + 10_000);
    const base = `api/projects/${projectId}`;
    const made = await owner.call<{ id: string }>("POST", `${base}/slos`, { service: "api", kind: "latency", target: 50, thresholdMs: 500, windowDays: 30 });
    expect(made.status).toBe(201);
    const list = await owner.call<{ slos: { status: { total: number; good: number; budgetLeft: number } }[] }>("GET", `${base}/slos`);
    expect(list.body.slos[0]!.status).toMatchObject({ total: 4, good: 2, budgetLeft: 0 });
    expect((await owner.call("PUT", `${base}/apdex`, { apdex: { api: 4000 } })).status).toBe(200);
    expect((await owner.call<{ apdex: { targetMs: number } }>("GET", `api/models/service?project=${projectId}&range=1h&service=api:api`)).body.apdex.targetMs).toBe(4000);
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "viewer"), "vic@acme.io");
    expect((await vic.call("PUT", `${base}/apdex`, { apdex: {} })).status).toBe(403);
    expect((await vic.call("GET", `${base}/slos/${made.body.id}`)).status).toBe(200);
    const rule = { name: "Burn", metric: "slo", op: ">", threshold: 2, windowMs: 3_600_000 };
    expect((await owner.call<{ error: string }>("POST", `${base}/alerts`, { ...rule, sloId: "nope" })).body.error).toMatch(/SLO/);
    expect((await owner.call<{ sloId: string }>("POST", `${base}/alerts`, { ...rule, sloId: made.body.id })).body.sloId).toBe(made.body.id);
  }, 60_000);
});
