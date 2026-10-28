import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { Client, invite, joinWithInvite, type Me, PASSWORD, setupOwner, startCloud } from "../test/cloud.js";
import { type IdpUser, startIdp } from "../test/idp.js";
import { recheckSso } from "./sso-recheck.js";

let cloud: Cloud;
let idp: Awaited<ReturnType<typeof startIdp>> | undefined;
afterEach(async () => {
  await cloud?.close();
  await idp?.close();
  cloud = undefined!;
  idp = undefined;
});

const CLIENT = "wizelens-test";
const oidc = (issuer: string, domain = "acme.io") => ({ providerId: "acme", issuer, domain, oidcConfig: { clientId: CLIENT, clientSecret: "s3cret", pkce: true } });

/** A cloud that trusts a test IdP, with an owner and that IdP registered (and, when asked, its domain proven). */
async function withIdp(user: IdpUser, verified = true) {
  idp = await startIdp(user, CLIENT);
  let url: string;
  ({ cloud, url } = await startCloud({ ssoOrigins: [idp.issuer] }));
  const { owner, orgId } = await setupOwner(cloud, url);
  const made = await owner.call<{ domainVerificationToken?: string }>("POST", "api/auth/sso/register", { ...oidc(idp.issuer), organizationId: orgId });
  expect(made.status).toBe(200);
  expect(made.body.domainVerificationToken).toBeTruthy();
  if (verified) await cloud.app.db.query("UPDATE sso_providers SET domain_verified = TRUE WHERE provider_id = 'acme'");
  return { url, owner, orgId };
}

/** Start SSO as a browser would, follow the IdP back to the cloud, and return the client and where the cloud sent it. */
async function ssoSignIn(url: string, email: string): Promise<{ c: Client; status: number }> {
  const c = new Client(url);
  const start = await c.call<{ url?: string }>("POST", "api/auth/sign-in/sso", { email, callbackURL: `${url}/_wizelens/#/`, errorCallbackURL: `${url}/_wizelens/#/` });
  if (!start.body.url) return { c, status: start.status };
  const back = (await fetch(start.body.url, { redirect: "manual" })).headers.get("location") ?? "";
  return { c, status: (await c.call("GET", back.slice(`${url}/_wizelens/`.length))).status };
}

describe("adding an SSO provider", () => {
  it("lets only owners and admins add a provider, for their organization, with PKCE", async () => {
    let url: string;
    ({ cloud, url } = await startCloud({ ssoOrigins: ["https://idp.example"] }));
    const { owner, orgId } = await setupOwner(cloud, url);
    expect((await owner.call("POST", "api/auth/sso/register", oidc("https://idp.example"))).status).toBe(400);
    const noPkce = { ...oidc("https://idp.example"), organizationId: orgId, oidcConfig: { clientId: CLIENT, clientSecret: "s", pkce: false } };
    expect((await owner.call("POST", "api/auth/sso/register", noPkce)).status).toBe(400);
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "member"), "vic@acme.io");
    expect((await vic.call("POST", "api/auth/sso/register", { ...oidc("https://idp.example"), organizationId: orgId })).status).toBe(403);
  });

  it("fetches OIDC settings only from origins in --sso-origins", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    const res = await owner.call("POST", "api/auth/sso/register", { ...oidc("http://127.0.0.1:1"), organizationId: orgId });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await cloud.app.db.query("SELECT 1 FROM sso_providers")).length).toBe(0);
  });
});

describe("signing in with SSO", () => {
  it("refuses sign-in until the domain is proven", async () => {
    const { url } = await withIdp({ sub: "u1", email: "sam@acme.io", name: "Sam" }, false);
    const { status } = await ssoSignIn(url, "sam@acme.io");
    expect(status).toBe(401);
    expect(((await new Client(url).call<{ sso: boolean }>("GET", "api/me")).body.sso)).toBe(false);
  });

  it("signs a new person in, confirmed, as a member of the provider's organization", async () => {
    const { url, orgId } = await withIdp({ sub: "u1", email: "sam@acme.io", name: "Sam" });
    expect((await new Client(url).call<{ sso: boolean }>("GET", "api/me")).body.sso).toBe(true);
    const { c, status } = await ssoSignIn(url, "sam@acme.io");
    expect(status).toBe(302);
    const me = (await c.call<Me>("GET", "api/me")).body;
    expect(me.signedIn).toBe(true);
    expect(me.user.emailVerified).toBe(true);
    expect(me.orgs.map((o) => [o.id, o.role])).toEqual([[orgId, "member"]]);
    const actions = await cloud.app.db.query<{ action: string }>("SELECT action FROM audit WHERE org_id = $1 ORDER BY time_ms", [orgId]);
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(["sso.create", "member.join"]));
  });

});

describe("SSO with invites and removals", () => {
  it("leaves an invited person to their invite, and shows it to them once the email is proven", async () => {
    const { url, owner, orgId } = await withIdp({ sub: "u3", email: "sam@acme.io", name: "Sam" });
    expect((await invite(owner, orgId, "sam@acme.io", "viewer")).length).toBeGreaterThan(0);
    const { c } = await ssoSignIn(url, "sam@acme.io");
    expect((await c.call<Me>("GET", "api/me")).body.orgs).toEqual([]);
    expect((await c.call<{ orgName: string; role: string }[]>("GET", "api/me/invites")).body).toEqual([expect.objectContaining({ role: "viewer" })]);
    await cloud.app.db.query("UPDATE users SET email_verified = FALSE WHERE email = 'sam@acme.io'");
    expect((await c.call<unknown[]>("GET", "api/me/invites")).body).toEqual([]);
  });

  it("does not add back a person an owner removed, until they accept a new invite", async () => {
    const { url, owner, orgId } = await withIdp({ sub: "u4", email: "sam@acme.io", name: "Sam" });
    await ssoSignIn(url, "sam@acme.io");
    expect((await owner.call("POST", "api/auth/organization/remove-member", { memberIdOrEmail: "sam@acme.io", organizationId: orgId })).status).toBe(200);
    const { c } = await ssoSignIn(url, "sam@acme.io");
    expect((await c.call<Me>("GET", "api/me")).body.orgs).toEqual([]);
    const refused = await cloud.app.db.query("SELECT 1 FROM audit WHERE org_id = $1 AND action = 'sso.join_refused'", [orgId]);
    expect(refused.length).toBe(1);
    const id = await invite(owner, orgId, "sam@acme.io", "viewer");
    expect((await c.call("POST", "api/auth/organization/accept-invitation", { invitationId: id })).status).toBe(200);
    await ssoSignIn(url, "sam@acme.io");
    expect((await c.call<Me>("GET", "api/me")).body.orgs.map((o) => [o.id, o.role])).toEqual([[orgId, "viewer"]]);
    expect((await cloud.app.db.query("SELECT 1 FROM sso_removed")).length).toBe(0);
  });

  it("makes no account for an email outside the provider's domain", async () => {
    const { url } = await withIdp({ sub: "u2", email: "eve@evil.io", name: "Eve" });
    const { c } = await ssoSignIn(url, "sam@acme.io");
    expect((await c.call<Me>("GET", "api/me")).body.signedIn).toBe(false);
    expect((await cloud.app.db.query("SELECT 1 FROM users WHERE email = 'eve@evil.io'")).length).toBe(0);
  });

  it("removes a provider with its sign-ins, and logs it", async () => {
    const { url, owner, orgId } = await withIdp({ sub: "u1", email: "sam@acme.io", name: "Sam" });
    await ssoSignIn(url, "sam@acme.io");
    expect((await cloud.app.db.query("SELECT 1 FROM accounts WHERE provider_id = 'acme'")).length).toBe(1);
    expect((await owner.call("POST", "api/auth/sso/delete-provider", { providerId: "acme" })).status).toBe(200);
    expect((await cloud.app.db.query("SELECT 1 FROM accounts WHERE provider_id = 'acme'")).length).toBe(0);
    const actions = await cloud.app.db.query<{ action: string }>("SELECT action FROM audit WHERE org_id = $1", [orgId]);
    expect(actions.map((a) => a.action)).toContain("sso.delete");
  });
});

describe("requiring single sign-on for a domain", () => {
  it("refuses passwords at the domain, signs people out, and keeps the owner's way back in", async () => {
    const { url, owner, orgId } = await withIdp({ sub: "u1", email: "sam@acme.io", name: "Sam" });
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "member"), "vic@acme.io");
    expect((await vic.call("PATCH", `api/orgs/${orgId}/sso/acme`, { required: true })).status).toBe(403);
    const on = await owner.call<{ signedOut: number }>("PATCH", `api/orgs/${orgId}/sso/acme`, { required: true });
    expect([on.status, on.body.signedOut]).toEqual([200, 1]);
    expect((await vic.call<Me>("GET", "api/me")).body.signedIn).toBe(false);
    const again = await new Client(url).call<{ message: string }>("POST", "api/auth/sign-in/email", { email: "vic@acme.io", password: PASSWORD });
    expect([again.status, again.body.message]).toEqual([403, expect.stringMatching(/People at acme.io sign in with single sign-on/)]);
    expect((await new Client(url).call("POST", "api/auth/sign-up/email", { email: "new@acme.io", password: PASSWORD, name: "New" })).status).toBe(403);
    expect((await new Client(url).call("POST", "api/auth/request-password-reset", { email: "vic@acme.io" })).status).toBe(403);
    expect((await new Client(url).call("POST", "api/auth/sign-in/email", { email: "owner@acme.io", password: PASSWORD })).status).toBe(200);
    expect((await ssoSignIn(url, "sam@acme.io")).status).toBe(302);
    expect((await owner.call<{ providerId: string; required: boolean }[]>("GET", `api/orgs/${orgId}/sso`)).body).toEqual([{ providerId: "acme", required: true }]);
    const lines = await cloud.app.db.query<{ detail: string }>("SELECT detail FROM audit WHERE org_id = $1 AND action = 'sso.require'", [orgId]);
    expect(JSON.parse(lines[0]!.detail)).toMatchObject({ domain: "acme.io", required: true, signedOut: 1 });
  });

  it("links an account whose email was never confirmed, and ends its unproven password", async () => {
    const { url, owner, orgId } = await withIdp({ sub: "u2", email: "vic@acme.io", name: "Vic" });
    await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "member"), "vic@acme.io");
    await cloud.app.db.query("UPDATE users SET email_verified = FALSE WHERE email = 'vic@acme.io'");
    const signedIn = async () => (await (await ssoSignIn(url, "vic@acme.io")).c.call<Me>("GET", "api/me")).body.signedIn;
    expect(await signedIn()).toBe(false);
    expect((await owner.call("PATCH", `api/orgs/${orgId}/sso/acme`, { required: true })).status).toBe(200);
    expect(await signedIn()).toBe(true);
    const ways = await cloud.app.db.query<{ provider_id: string }>("SELECT a.provider_id FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = 'vic@acme.io'");
    expect(ways.map((w) => w.provider_id)).toEqual(["acme"]);
  });

  it("needs the domain proven first", async () => {
    const { owner, orgId } = await withIdp({ sub: "u1", email: "sam@acme.io", name: "Sam" }, false);
    expect((await owner.call("PATCH", `api/orgs/${orgId}/sso/acme`, { required: true })).status).toBe(409);
  });
});

describe("a person their identity provider turned off", () => {
  it("is signed out at the next check, and kept signed in while the provider is down", async () => {
    const { url, orgId } = await withIdp({ sub: "u-9", email: "vic@acme.io", name: "Vic" });
    const { c } = await ssoSignIn(url, "vic@acme.io");
    const signedIn = async () => (await c.call<Me>("GET", "api/me")).body.signedIn;
    expect([await recheckSso(cloud.app), await signedIn()]).toEqual([0, true]);
    idp!.setMode("down");
    expect([await recheckSso(cloud.app), await signedIn()]).toEqual([0, true]);
    idp!.setMode("disabled");
    expect([await recheckSso(cloud.app), await signedIn()]).toEqual([1, false]);
    expect(await recheckSso(cloud.app)).toBe(0);
    const [line] = await cloud.app.db.query<{ actor: string; detail: string }>("SELECT actor, detail FROM audit WHERE org_id = $1 AND action = 'sso.signed_out'", [orgId]);
    expect([line?.actor, JSON.parse(line?.detail ?? "{}").sessions]).toEqual(["system", 1]);
  });
});
