import { afterEach, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { mailbox, PASSWORD, startCloud } from "../test/cloud.js";
import { confirmedMember, confirmedOwner, subjects, until } from "../test/notify.js";
import { sendTeamNotices } from "./team.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

async function team() {
  const box = mailbox();
  let url: string;
  ({ cloud, url } = await startCloud({ jobs: false, sendMail: box.sendMail }));
  const o = await confirmedOwner(cloud, url, box);
  const admin = await confirmedMember(url, box, o.owner, o.orgId, "vic@acme.io", "admin");
  await sendTeamNotices(cloud.app);
  await new Promise((r) => setTimeout(r, 300));
  box.sent.length = 0;
  return { box, url, admin, ...o };
}

const teamMail = (box: ReturnType<typeof mailbox>, to: string) => box.sent.filter((m) => m.to === to && m.kind === "team");

it("tells owners and admins what others changed, in one email, and not what they did themselves", async () => {
  const { box, admin, orgId, org, projectId } = await team();
  await admin.call("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", name: "prod", projectIds: [projectId] });
  await admin.call("POST", `api/orgs/${orgId}/projects`, { name: "Billing" });
  await sendTeamNotices(cloud.app);
  await until(() => teamMail(box, "owner@acme.io").length === 1);
  const mail = teamMail(box, "owner@acme.io")[0]!;
  expect(mail.subject).toBe(`2 changes in ${org} on WizeLens`);
  expect(mail.text).toContain("Vic (vic@acme.io) made an ingest key for My app.");
  expect(mail.text).toContain("Vic (vic@acme.io) made the project Billing.");
  expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  expect(teamMail(box, "vic@acme.io")).toHaveLength(0);
  await sendTeamNotices(cloud.app);
  expect(teamMail(box, "owner@acme.io")).toHaveLength(1);
});

it("tells a member when their own role changes", async () => {
  const { box, owner, orgId, org } = await team();
  const members = (await owner.call<{ members: { memberId: string; email: string }[] }>("GET", `api/orgs/${orgId}`)).body.members;
  const vic = members.find((m) => m.email === "vic@acme.io")!;
  expect((await owner.call("POST", "api/auth/organization/update-member-role", { memberId: vic.memberId, role: "member", organizationId: orgId })).status).toBe(200);
  const [row] = await cloud.app.db.query<{ detail: string }>("SELECT detail FROM audit WHERE org_id = $1 AND action = 'member.role'", [orgId]);
  expect(JSON.parse(row!.detail)).toMatchObject({ memberEmail: "vic@acme.io", role: "member" });
  await sendTeamNotices(cloud.app);
  await until(() => subjects(box, "vic@acme.io").includes(`Your role in ${org} is now member`));
});

it("stops team emails from the one-click link, and a GET changes nothing", async () => {
  const { box, admin, orgId, projectId } = await team();
  await admin.call("POST", `api/orgs/${orgId}/keys`, { kind: "read", projectIds: [projectId] });
  await sendTeamNotices(cloud.app);
  await until(() => teamMail(box, "owner@acme.io").length === 1);
  const link = /<(.+)>/.exec(teamMail(box, "owner@acme.io")[0]!.headers!["List-Unsubscribe"]!)![1]!;
  expect(await (await fetch(link)).text()).toContain("Stop emails about team changes");
  expect((await fetch(`${link}x`, { method: "POST" })).status).toBe(400);
  const res = await fetch(link, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  expect(res.status).toBe(200);
  await admin.call("POST", `api/orgs/${orgId}/projects`, { name: "Billing" });
  await sendTeamNotices(cloud.app);
  await new Promise((r) => setTimeout(r, 100));
  expect(teamMail(box, "owner@acme.io")).toHaveLength(1);
});

it("tells every member when the organization is deleted", async () => {
  const { box, owner, orgId, org } = await team();
  expect((await owner.call("DELETE", `api/orgs/${orgId}`, { password: PASSWORD })).status).toBe(200);
  await until(() => subjects(box, "vic@acme.io").includes(`${org} was deleted on WizeLens`));
  expect(subjects(box, "owner@acme.io")).not.toContain(`${org} was deleted on WizeLens`);
});
