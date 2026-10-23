import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

interface Reply {
  settings: { slowQueryMs?: number; redactKeys?: string[]; retentionDays?: number };
}

describe("copy project settings", () => {
  it("copies thresholds and hidden keys, and retention only when asked", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const [b, c] = [(await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "B" })).body.id, (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "C" })).body.id];
    await owner.call("PUT", `api/projects/${projectId}/settings`, { slowQueryMs: 250, redactKeys: ["ssn"], retentionDays: 7 });
    await owner.call("PATCH", `api/orgs/${orgId}/projects/${projectId}`, { logRetentionDays: 3 });
    await owner.call("PUT", `api/projects/${c}/settings`, { retentionDays: 14 });
    const res = await owner.call<{ copied: number }>("POST", `api/orgs/${orgId}/settings/copy`, { from: projectId, projectIds: [b, c, projectId], parts: ["checks"] });
    expect(res.body.copied).toBe(2);
    const of = async (id: string) => (await owner.call<Reply>("GET", `api/projects/${id}/settings`)).body.settings;
    expect(await of(b)).toEqual({ slowQueryMs: 250, redactKeys: ["ssn"] });
    expect(await of(c)).toEqual({ slowQueryMs: 250, redactKeys: ["ssn"], retentionDays: 14 });
    await owner.call("POST", `api/orgs/${orgId}/settings/copy`, { from: projectId, projectIds: [c], parts: ["retention"] });
    expect((await of(c)).retentionDays).toBe(7);
    const projects = (await owner.call<{ projects: { id: string; logRetentionDays: number | null }[] }>("GET", `api/orgs/${orgId}`)).body.projects;
    expect(projects.find((p) => p.id === c)?.logRetentionDays).toBe(3);
    expect((await owner.call("POST", `api/orgs/${orgId}/settings/copy`, { from: projectId, projectIds: [b], parts: [] })).status).toBe(400);
  });

  it("needs manage rights on every target", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const b = (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "B" })).body.id;
    const mo = await joinWithInvite(url, await invite(owner, orgId, "mo@acme.io", "member"), "mo@acme.io");
    expect((await mo.call("POST", `api/orgs/${orgId}/settings/copy`, { from: projectId, projectIds: [b], parts: ["checks"] })).status).toBe(403);
  });
});
