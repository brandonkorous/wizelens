import type { Span } from "@wizeworks/lens-core";
import type { Mail } from "../mail/mailer.js";
import type { Cloud } from "../server.js";
import { Client, invite, type Me, type mailbox, PASSWORD } from "./cloud.js";

type Box = ReturnType<typeof mailbox>;

/** Wait until `check` holds: mail leaves in the background. */
export async function until(check: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const confirm = async (c: Client, box: Box, email: string) => {
  await until(() => !!box.token(email));
  const res = await c.call("GET", `api/auth/verify-email?token=${box.token(email)}`);
  if (res.status !== 200) throw new Error(`verify failed: ${res.status}`);
};

/** The first account, with its email confirmed (real mail is on, so sign-in waits for it). */
export async function confirmedOwner(cloud: Cloud, url: string, box: Box, email = "owner@acme.io") {
  const owner = new Client(url);
  const token = new URL(cloud.setupLink()!.replace("#/", "")).searchParams.get("token")!;
  await owner.call("POST", "api/auth/sign-up/email", { email, password: PASSWORD, name: "Olive" }, { "x-wizelens-setup-token": token });
  await confirm(owner, box, email);
  const me = (await owner.call<Me>("GET", "api/me")).body;
  const org = me.orgs[0] as Me["orgs"][number] & { name: string };
  return { owner, userId: me.user.id, orgId: org.id, org: org.name, projectId: org.projects[0]!.id };
}

/** An invited member with a confirmed email, signed in. */
export async function confirmedMember(url: string, box: Box, owner: Client, orgId: string, email: string, role: string, name = "Vic") {
  const id = await invite(owner, orgId, email, role);
  const c = new Client(url);
  await c.call("POST", "api/auth/sign-up/email", { email, password: PASSWORD, name });
  await confirm(c, box, email);
  const accept = await c.call("POST", "api/auth/organization/accept-invitation", { invitationId: id });
  if (accept.status !== 200) throw new Error(`accept failed: ${accept.status}`);
  return c;
}

export const subjects = (box: Box, to: string) => box.sent.filter((m: Mail) => m.to === to).map((m) => m.subject);

/** Send spans with a new ingest key. */
export async function ingest(url: string, owner: Client, orgId: string, projectId: string, spans: Span[]): Promise<void> {
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const res = await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "api" }, spans }) });
  if (res.status !== 204) throw new Error(`ingest failed: ${res.status}`);
}
