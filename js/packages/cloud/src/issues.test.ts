import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

describe("cloud issues", () => {
  it("lets members who can write resolve and assign, refuses viewers, and writes the audit log", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const base = `api/projects/${projectId}/issues`;
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "viewer"), "vic@acme.io");
    expect((await vic.call("POST", base, { kind: "error", key: "api|Error|boom", action: "resolve" })).status).toBe(403);
    expect((await owner.call("POST", base, { kind: "error", key: "api|Error|boom", action: "resolve" })).status).toBe(200);
    const list = await owner.call<{ issues: { status: string; assignee: string | null }[]; members: { id: string }[] }>("GET", base);
    expect(list.body.issues).toMatchObject([{ status: "resolved" }]);
    const me = list.body.members[0]!.id;
    expect((await owner.call("POST", base, { kind: "error", key: "api|Error|boom", action: "assign", assignee: me })).status).toBe(200);
    expect((await owner.call("POST", base, { kind: "error", key: "api|Error|boom", action: "assign", assignee: "stranger" })).status).toBe(400);
    expect((await owner.call<{ issues: { assignee: string | null }[] }>("GET", base)).body.issues[0]!.assignee).toBe(me);
    const audit = (await owner.call<{ action: string }[]>("GET", `api/orgs/${orgId}/audit`)).body.map((a) => a.action);
    expect(audit).toEqual(expect.arrayContaining(["issue.resolve", "issue.assign"]));
    const errors = await owner.call<{ hasIssues: boolean }>("GET", `api/models/errors?project=${projectId}&status=resolved`);
    expect(errors.body.hasIssues).toBe(true);
  });
});

describe("cloud issues in bulk", () => {
  it("resolves many in one request with one audit entry, and assigns many", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const base = `api/projects/${projectId}/issues`;
    const keys = ["api|Error|a", "api|Error|b", "api|Error|c"];
    const res = await owner.call<{ issues: { status: string }[] }>("POST", base, { kind: "error", keys, action: "resolve" });
    expect(res.body.issues.map((i) => i.status)).toEqual(["resolved", "resolved", "resolved"]);
    const me = (await owner.call<{ members: { id: string }[] }>("GET", base)).body.members[0]!.id;
    expect((await owner.call("POST", base, { kind: "error", keys: keys.slice(0, 2), action: "assign", assignee: me })).status).toBe(200);
    const list = (await owner.call<{ issues: { key: string; assignee: string | null }[] }>("GET", base)).body.issues;
    expect(list.filter((i) => i.assignee === me).map((i) => i.key).sort()).toEqual(keys.slice(0, 2));
    const audit = (await owner.call<{ action: string; detail: { keys?: string[] } }[]>("GET", `api/orgs/${orgId}/audit`)).body.filter((a) => a.action === "issue.resolve");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.detail.keys).toEqual(keys);
  });
});
