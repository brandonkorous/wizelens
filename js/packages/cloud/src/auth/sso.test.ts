import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { Client, invite, joinWithInvite, type Me, setupOwner, startCloud } from "../test/cloud.js";
import { type IdpUser, startIdp } from "../test/idp.js";

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
