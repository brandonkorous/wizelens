import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { invite, joinWithInvite, setupOwner, startCloud } from "../test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const RULE = { name: "Errors", metric: "error_rate", op: ">", threshold: 10, windowMs: 300_000, channels: [] };

interface Rule {
  id: string;
  projectId: string;
  enabled: boolean;
  mutedUntilMs: number | null;
}

describe("alerts across projects", () => {
  it("makes one rule in many projects, all or none", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const other = (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "Other" })).body.id;
    const res = await owner.call<{ created: { projectId: string }[] }>("POST", `api/orgs/${orgId}/alerts/copy`, { rule: RULE, projectIds: [projectId, other] });
    expect(res.status).toBe(201);
    expect(res.body.created.map((c) => c.projectId).sort()).toEqual([projectId, other].sort());
    expect((await owner.call<{ rules: Rule[] }>("GET", `api/projects/${other}/alerts`)).body.rules).toHaveLength(1);
    expect((await owner.call("POST", `api/orgs/${orgId}/alerts/copy`, { rule: { ...RULE, threshold: "x" }, projectIds: [projectId] })).status).toBe(400);
    expect((await owner.call("POST", `api/orgs/${orgId}/alerts/copy`, { rule: { ...RULE, metric: "slo" }, projectIds: [projectId, other] })).status).toBe(400);
    expect((await owner.call("POST", `api/orgs/${orgId}/alerts/copy`, { rule: RULE, projectIds: [projectId, "nope"] })).status).toBe(404);
    expect((await owner.call<{ rules: Rule[] }>("GET", `api/projects/${projectId}/alerts`)).body.rules).toHaveLength(1);
  });

  it("mutes, turns off, and deletes many rules", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const other = (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "Other" })).body.id;
    await owner.call("POST", `api/orgs/${orgId}/alerts/copy`, { rule: RULE, projectIds: [projectId, other] });
    const all = async () => [...(await owner.call<{ rules: Rule[] }>("GET", `api/projects/${projectId}/alerts`)).body.rules, ...(await owner.call<{ rules: Rule[] }>("GET", `api/projects/${other}/alerts`)).body.rules];
    const rules = (await all()).map((r) => ({ projectId: r.projectId, id: r.id }));
    expect((await owner.call<{ changed: number }>("POST", `api/orgs/${orgId}/alerts/bulk`, { action: "mute", rules, untilMs: -1 })).body.changed).toBe(2);
    expect((await all()).every((r) => r.mutedUntilMs !== null)).toBe(true);
    await owner.call("POST", `api/orgs/${orgId}/alerts/bulk`, { action: "disable", rules });
    expect((await all()).every((r) => !r.enabled)).toBe(true);
    expect((await owner.call("POST", `api/orgs/${orgId}/alerts/bulk`, { action: "mute", rules, untilMs: 5 })).status).toBe(400);
    const gone = await owner.call<{ changed: number; missing: string[] }>("POST", `api/orgs/${orgId}/alerts/bulk`, { action: "delete", rules: [...rules, { projectId, id: "x" }] });
    expect(gone.body).toEqual({ changed: 2, missing: ["x"] });
    expect(await all()).toHaveLength(0);
  });

  it("refuses viewers", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "viewer"), "vic@acme.io");
    expect((await vic.call("POST", `api/orgs/${orgId}/alerts/copy`, { rule: RULE, projectIds: [projectId] })).status).toBe(403);
    expect((await vic.call("POST", `api/orgs/${orgId}/alerts/bulk`, { action: "delete", rules: [{ projectId, id: "x" }] })).status).toBe(403);
  });
});
