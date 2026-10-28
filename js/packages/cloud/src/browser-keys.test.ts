import { afterEach, describe, expect, it } from "vitest";
import { ATTR_BROWSER_APP } from "@wizeworks/lens-core";
import { originAllowed, originOf, originsFor } from "./repo/key-origins.js";
import { browserWrite } from "./routes/browser.js";
import type { Cloud } from "./server.js";
import { type Client, setupOwner, startCloud } from "./test/cloud.js";
import { span, T1 } from "./test/db.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const SHOP = "https://shop.example.com";

async function browserKey(owner: Client, orgId: string, projectId: string, origins: unknown = [SHOP]) {
  return owner.call<{ id: string; token: string; origins: string[]; error?: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "browser", name: "site", projectIds: [projectId], origins });
}

async function setup() {
  let url: string;
  ({ cloud, url } = await startCloud());
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const made = (await browserKey(owner, orgId, projectId)).body;
  const intake = `${url}/_wizelens/b/${made.token}/api/client-spans`;
  const post = (body: unknown, origin = SHOP, extra: Record<string, string> = {}) =>
    fetch(intake, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: origin, ...extra }, body: JSON.stringify(body) });
  return { url, owner, orgId, projectId, made, intake, post };
}

const pageView = (extra = {}) => span(T1, "1".repeat(16), { name: "pageview /", kind: "internal", category: "browser", service: "browser", startMs: Date.now() - 60_000, ...extra });

describe("sites of a browser key", () => {
  it("takes origins and subdomain wildcards, and nothing with a path", () => {
    expect(originOf("https://Shop.Example.com/")).toBe(SHOP);
    expect(originOf("http://localhost:3000")).toBe("http://localhost:3000");
    expect(originOf("https://*.example.com")).toBe("https://*.example.com");
    expect(originOf("https://example.com/app")).toBeNull();
    expect(originOf("ftp://example.com")).toBeNull();
    expect(originsFor("https://a.io, https://a.io http://localhost:5173")).toEqual(["https://a.io", "http://localhost:5173"]);
    expect(() => originsFor([])).toThrow(/List the sites/);
  });

  it("matches the exact site, or any subdomain of a wildcard", () => {
    expect(originAllowed([SHOP], SHOP)).toBe(true);
    expect(originAllowed([SHOP], "https://evil.example")).toBe(false);
    expect(originAllowed(["https://*.example.com"], "https://docs.example.com")).toBe(true);
    expect(originAllowed(["https://*.example.com"], "https://example.com")).toBe(false);
    expect(originAllowed(["https://*.example.com"], "https://notexample.com")).toBe(false);
    expect(originAllowed([SHOP], undefined)).toBe(false);
  });
});

describe("the browser intake", () => {
  it("stores page data from a listed site as browser spans only", async () => {
    const { owner, projectId, made, post } = await setup();
    expect(made.token.startsWith("wl_bk_")).toBe(true);
    expect(made.origins).toEqual([SHOP]);
    const forged = span(T1, "2".repeat(16), { startMs: Date.now() - 59_000, service: "orders-api", category: "db", kind: "server" });
    const res = await post({ spans: [pageView(), forged], sentAt: Date.now() });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(SHOP);
    const trace = await owner.call<{ spans: { service: string; category: string; kind: string }[] }>("GET", `api/traces/${T1}?project=${projectId}`);
    expect(trace.body.spans.map((s) => [s.service, s.category, s.kind])).toEqual([["browser", "browser", "internal"], ["browser", "browser", "client"]]);
  });

  it("answers the CORS check for its sites only", async () => {
    const { intake } = await setup();
    const check = (origin: string) => fetch(intake, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
    const ok = await check(SHOP);
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-methods")).toBe("POST");
    expect((await check("https://evil.example")).status).toBe(403);
  });

  it("refuses other sites, other key kinds, and a browser key anywhere else", async () => {
    const { url, owner, orgId, projectId, made, post } = await setup();
    expect((await post({ spans: [pageView()] }, "https://evil.example")).status).toBe(403);
    const ingest = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
    const asIngest = await fetch(`${url}/_wizelens/b/${ingest}/api/client-spans`, { method: "POST", headers: { Origin: SHOP }, body: "{}" });
    expect(asIngest.status).toBe(401);
    const elsewhere = await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${made.token}` }, body: "{}" });
    expect(elsewhere.status).toBe(401);
    const read = await fetch(`${url}/_wizelens/api/traces?project=${projectId}`, { headers: { Authorization: `Bearer ${made.token}` } });
    expect(read.status).toBe(401);
  });

  it("refuses a secret key in a page, and tells its owners once an hour", async () => {
    const { url, owner, orgId, projectId } = await setup();
    const made = (await owner.call<{ id: string; token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", name: "site — first try", projectIds: [projectId] })).body;
    const send = () => fetch(`${url}/_wizelens/b/${made.token}/api/client-spans`, { method: "POST", headers: { Origin: SHOP }, body: "{}" });
    const res = await send();
    expect(res.status).toBe(401);
    expect(await res.text()).toMatch(/secret key: it must never be in a page/);
    await send();
    const lines = await owner.call<{ action: string; detail: { keyId: string; origin: string } }[]>("GET", `api/orgs/${orgId}/audit?action=key.exposed`);
    expect(lines.body.map((l) => [l.action, l.detail.keyId, l.detail.origin])).toEqual([["key.exposed", made.id, SHOP]]);
    const org = await owner.call<{ keys: { id: string; exposed: { origin: string } | null }[] }>("GET", `api/orgs/${orgId}`);
    expect(org.body.keys.find((k) => k.id === made.id)?.exposed?.origin).toBe(SHOP);
  });

  it("needs sites to make a key, and lets them change in place", async () => {
    const { owner, orgId, projectId, made, post } = await setup();
    expect((await browserKey(owner, orgId, projectId, [])).status).toBe(400);
    expect((await browserKey(owner, orgId, projectId, ["https://a.io/path"])).status).toBe(400);
    const docs = "https://docs.example.com";
    expect((await post({ spans: [pageView()] }, docs)).status).toBe(403);
    expect((await owner.call("PATCH", `api/orgs/${orgId}/keys/${made.id}`, { origins: [SHOP, docs] })).status).toBe(200);
    expect((await post({ spans: [pageView()] }, docs)).status).toBe(204);
  });
});

describe("the browser app a key's data shows under", () => {
  it("is the page's own name, else the key's name", () => {
    const named = pageView({ spanId: "3".repeat(16), attributes: { [ATTR_BROWSER_APP]: "shop-web" } });
    const w = browserWrite({ spans: [pageView(), named], logs: [{ traceId: T1, timeMs: Date.now(), level: "info", category: "console", message: "hi", attributes: {} }] }, [], Date.now(), "site");
    expect(w.spans.map((s) => s.attributes[ATTR_BROWSER_APP])).toEqual(["site", "shop-web"]);
    expect(w.logs.map((l) => l.log.attributes[ATTR_BROWSER_APP])).toEqual(["site"]);
  });
});
