import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { Client, invite, joinWithInvite, type Me, PASSWORD, setupOwner, startCloud } from "../test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const signIn = async (url: string, email: string, password = PASSWORD) => {
  const c = new Client(url);
  expect((await c.call("POST", "api/auth/sign-in/email", { email, password })).status).toBe(200);
  return c;
};

describe("sessions and passwords", () => {
  it("lists devices, signs one out, and a password change can sign out the rest", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner } = await setupOwner(cloud, url);
    const laptop = await signIn(url, "owner@acme.io");
    const sessions = (await owner.call<{ token: string }[]>("GET", "api/auth/list-sessions")).body;
    expect(sessions).toHaveLength(2);
    const devices = (await owner.call<Record<string, unknown>[]>("GET", "api/auth/wizelens/devices")).body;
    expect(devices.map((d) => d.id).sort()).toEqual(sessions.map((s) => (s as unknown as { id: string }).id).sort());
    expect(devices.some((d) => "token" in d)).toBe(false);
    const laptopToken = decodeURIComponent(laptop.cookies.get("wizelens.session_token")!).split(".")[0];
    expect((await owner.call("POST", "api/auth/revoke-session", { token: laptopToken })).status).toBe(200);
    expect((await laptop.call<Me>("GET", "api/me")).body.signedIn).toBe(false);
    const phone = await signIn(url, "owner@acme.io");
    const changed = await owner.call("POST", "api/auth/change-password", { currentPassword: PASSWORD, newPassword: "the next long password", revokeOtherSessions: true });
    expect(changed.status).toBe(200);
    expect((await phone.call<Me>("GET", "api/me")).body.signedIn).toBe(false);
    expect((await owner.call<Me>("GET", "api/me")).body.signedIn).toBe(true);
  });
});

describe("leaving", () => {
  it("will not delete the last owner of a team, and deletes an account alone in its organization", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "member"), "vic@acme.io");
    expect((await owner.call<{ blockingOrgs: string[] }>("GET", "api/me")).body.blockingOrgs).toEqual(["Olive's team"]);
    expect((await owner.call("POST", "api/auth/delete-user", {})).status).toBe(400);
    const blocked = await owner.call<{ message: string }>("POST", "api/auth/delete-user", { password: PASSWORD });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/Make someone else an owner/);
    expect((await owner.call("POST", "api/auth/organization/remove-member", { memberIdOrEmail: "vic@acme.io", organizationId: orgId })).status).toBe(200);
    expect((await owner.call<{ soloOrgs: string[] }>("GET", "api/me")).body.soloOrgs).toEqual(["Olive's team"]);
    expect((await owner.call("POST", "api/auth/delete-user", { password: PASSWORD })).status).toBe(200);
    expect(await cloud.app.db.query("SELECT 1 FROM orgs WHERE id = $1", [orgId])).toEqual([]);
    expect((await vic.call<Me>("GET", "api/me")).body.orgs).toEqual([]);
  });

  it("deletes an organization for an owner who enters the password", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    const admin = await joinWithInvite(url, await invite(owner, orgId, "ada@acme.io", "admin"), "ada@acme.io", "Ada");
    expect((await admin.call("DELETE", `api/orgs/${orgId}`, { password: PASSWORD })).status).toBe(403);
    expect((await owner.call("DELETE", `api/orgs/${orgId}`, { password: "not it, sorry" })).status).toBe(400);
    expect((await owner.call("DELETE", `api/orgs/${orgId}`, { password: PASSWORD })).status).toBe(200);
    expect((await owner.call<Me>("GET", "api/me")).body.orgs).toEqual([]);
  });

  it("keeps an owner: the last one cannot leave or step down", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    expect((await owner.call("POST", "api/auth/organization/leave", { organizationId: orgId })).status).toBe(400);
    const me = (await owner.call<Me>("GET", "api/me")).body.user;
    const [m] = await cloud.app.db.query<{ id: string }>("SELECT id FROM members WHERE user_id = $1", [me.id]);
    expect((await owner.call("POST", "api/auth/organization/update-member-role", { memberId: m!.id, role: "admin", organizationId: orgId })).status).toBe(400);
    expect((await owner.call("POST", "api/auth/organization/update-member-role", { memberId: m!.id, role: "admin,owner", organizationId: orgId })).status).toBe(400);
  });
});

describe("alert email", () => {
  it("sends only to confirmed members of the organization", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, projectId } = await setupOwner(cloud, url);
    const rule = (to: string[]) => ({ name: "Errors", metric: "error_rate", op: ">", threshold: 1, windowMs: 300_000, channels: [{ kind: "email", to }] });
    const stranger = await owner.call<{ error: string }>("POST", `api/projects/${projectId}/alerts`, rule(["someone@else.io"]));
    expect(stranger.status).toBe(400);
    const ok = await owner.call<{ id: string }>("POST", `api/projects/${projectId}/alerts`, rule(["owner@acme.io"]));
    expect(ok.status).toBe(201);
    const test = await owner.call<{ delivery: string }>("POST", `api/projects/${projectId}/alerts/${ok.body.id}/test`, {});
    expect(test.body.delivery).toMatch(/^email: mail is not set up/);
  });
});
