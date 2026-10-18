import { getMigrations } from "better-auth/db/migration";
import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { Client, invite, joinWithInvite, type Me, mailbox, PASSWORD, setupOwner, startCloud } from "../test/cloud.js";
import { totpCode } from "../test/totp.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

describe("Better Auth setup", () => {
  it("finds nothing to change in our schema", async () => {
    ({ cloud } = await startCloud());
    const m = await getMigrations(cloud.app.auth.options);
    expect({ create: m.toBeCreated, add: m.toBeAdded, indexes: m.toBeAddedIndexes, unsafe: m.unsafeChanges, problems: m.schemaProblems }).toEqual({ create: [], add: [], indexes: [], unsafe: [], problems: [] });
  });

  it("needs the right setup token for the first account", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const res = await new Client(url).call("POST", "api/auth/sign-up/email", { email: "a@b.io", password: PASSWORD, name: "A" }, { "x-wizelens-setup-token": "wrong" });
    expect(res.status).toBe(403);
    expect(cloud.setupLink()).toMatch(/#\/setup\?token=/);
  });

  it("refuses a change from another site, and a request without the dashboard header", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner } = await setupOwner(cloud, url);
    expect((await owner.call("POST", "api/auth/update-user", { name: "Eve" }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await owner.call("POST", "api/auth/update-user", { name: "Eve" }, { "X-WizeLens-Client": "" })).status).toBe(403);
    expect((await owner.call("POST", "api/auth/update-user", { name: "Olivia" })).status).toBe(200);
  });

  it("limits wrong passwords per client address", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    await setupOwner(cloud, url);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await new Client(url).call("POST", "api/auth/sign-in/email", { email: "owner@acme.io", password: "wrong password!!" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("hides invite ids from members, and needs the invite id to sign up without mail", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    const id = await invite(owner, orgId, "vic@acme.io", "admin");
    expect((await owner.call("GET", `api/auth/organization/list-invitations?organizationId=${orgId}`)).status).toBe(404);
    const noId = await new Client(url).call("POST", "api/auth/sign-up/email", { email: "vic@acme.io", password: PASSWORD, name: "V" });
    expect(noId.status).toBe(403);
    const vic = await joinWithInvite(url, id, "vic@acme.io");
    expect((await vic.call<Me>("GET", "api/me")).body.orgs.map((o) => o.role)).toEqual(["admin"]);
  });
});

describe("two-step sign-in", () => {
  it("enables TOTP, then asks for a code at sign-in; a backup code works once", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner } = await setupOwner(cloud, url);
    const on = await owner.call<{ totpURI: string; backupCodes: string[] }>("POST", "api/auth/two-factor/enable", { password: PASSWORD });
    expect(on.status).toBe(200);
    expect((await owner.call("POST", "api/auth/two-factor/verify-totp", { code: totpCode(on.body.totpURI) })).status).toBe(200);
    expect((await owner.call<Me>("GET", "api/me")).body.user.twoFactorEnabled).toBe(true);
    const signIn = async () => {
      const c = new Client(url);
      const res = await c.call<{ twoFactorRedirect?: boolean }>("POST", "api/auth/sign-in/email", { email: "owner@acme.io", password: PASSWORD });
      expect(res.body.twoFactorRedirect).toBe(true);
      expect((await c.call<Me>("GET", "api/me")).body.signedIn).toBe(false);
      return c;
    };
    const phone = await signIn();
    expect((await phone.call("POST", "api/auth/two-factor/verify-totp", { code: "000000" })).status).toBe(401);
    expect((await phone.call("POST", "api/auth/two-factor/verify-totp", { code: totpCode(on.body.totpURI) })).status).toBe(200);
    expect((await phone.call<Me>("GET", "api/me")).body.signedIn).toBe(true);
    const backup = on.body.backupCodes[0]!;
    expect((await (await signIn()).call("POST", "api/auth/two-factor/verify-backup-code", { code: backup })).status).toBe(200);
    expect((await (await signIn()).call("POST", "api/auth/two-factor/verify-backup-code", { code: backup })).status).toBe(401);
  });
});

describe("email flows", () => {
  it("confirms the email before sign-in, and resets a password by link", async () => {
    const mail = mailbox();
    let url: string;
    ({ cloud, url } = await startCloud({ sendMail: mail.sendMail }));
    const c = new Client(url);
    const token = new URL(cloud.setupLink()!.replace("#/", "")).searchParams.get("token")!;
    expect((await c.call("POST", "api/auth/sign-up/email", { email: "ann@acme.io", password: PASSWORD, name: "Ann" }, { "x-wizelens-setup-token": token })).status).toBe(200);
    expect((await c.call("POST", "api/auth/sign-in/email", { email: "ann@acme.io", password: PASSWORD })).status).toBe(403);
    expect((await c.call("GET", `api/auth/verify-email?token=${mail.token("ann@acme.io")}`)).status).toBe(200);
    expect((await c.call<Me>("GET", "api/me")).body).toMatchObject({ signedIn: true, user: { emailVerified: true } });
    await c.call("POST", "api/auth/request-password-reset", { email: "ann@acme.io" });
    expect(mail.last("ann@acme.io")?.subject).toMatch(/Reset/);
    const fresh = "a brand new password";
    expect((await new Client(url).call("POST", "api/auth/reset-password", { token: mail.token("ann@acme.io"), newPassword: fresh })).status).toBe(200);
    expect((await c.call<Me>("GET", "api/me")).body.signedIn).toBe(false);
    expect((await new Client(url).call("POST", "api/auth/sign-in/email", { email: "ann@acme.io", password: fresh })).status).toBe(200);
  });

  it("with 2FA on, opens email-change links only on a signed-in device", async () => {
    const mail = mailbox();
    let url: string;
    ({ cloud, url } = await startCloud({ sendMail: mail.sendMail }));
    const c = new Client(url);
    const token = new URL(cloud.setupLink()!.replace("#/", "")).searchParams.get("token")!;
    await c.call("POST", "api/auth/sign-up/email", { email: "ann@acme.io", password: PASSWORD, name: "Ann" }, { "x-wizelens-setup-token": token });
    await c.call("GET", `api/auth/verify-email?token=${mail.token("ann@acme.io")}`);
    const on = await c.call<{ totpURI: string }>("POST", "api/auth/two-factor/enable", { password: PASSWORD });
    await c.call("POST", "api/auth/two-factor/verify-totp", { code: totpCode(on.body.totpURI) });
    expect((await c.call("POST", "api/auth/change-email", { newEmail: "ann@new.io" })).status).toBe(200);
    const open = (who: Client, to: string) => who.call("GET", `api/auth/verify-email?token=${mail.token(to)}`);
    expect((await open(new Client(url), "ann@acme.io")).status).toBe(401);
    expect((await open(c, "ann@acme.io")).status).toBe(200);
    expect((await open(new Client(url), "ann@new.io")).status).toBe(401);
    expect((await open(c, "ann@new.io")).status).toBe(200);
    expect((await c.call<Me>("GET", "api/me")).body.user.email).toBe("ann@new.io");
  });
});
