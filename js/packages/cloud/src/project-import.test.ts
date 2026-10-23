import { afterEach, describe, expect, it } from "vitest";
import type { ImportedKey } from "./repo/project-import.js";
import type { Cloud } from "./server.js";
import { invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

interface Imported {
  keys: ImportedKey[];
  expiresMs: number | null;
}

describe("project import", () => {
  it("makes many projects with a sending key each, and a key only for a name already there", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const projects = ["orders-api", "billing-api", { name: "Shop web", kind: "browser", sites: "https://shop.example.com/ https://*.example.com" }, "my app"];
    const res = await owner.call<Imported>("POST", `api/orgs/${orgId}/projects/import`, { projects, expiresInDays: 90 });
    expect(res.status).toBe(201);
    const { keys, expiresMs } = res.body;
    expect(expiresMs).toBeGreaterThan(Date.now());
    expect(keys.map((k) => [k.projectName, k.newProject, k.kind, k.token.slice(0, 6)])).toEqual([
      ["orders-api", true, "ingest", "wl_ik_"],
      ["billing-api", true, "ingest", "wl_ik_"],
      ["Shop web", true, "browser", "wl_bk_"],
      ["My app", false, "ingest", "wl_ik_"],
    ]);
    expect(keys[2]!.origins).toEqual(["https://shop.example.com", "https://*.example.com"]);
    expect(keys[3]!.projectId).toBe(projectId);
    const org = (await owner.call<{ projects: { id: string; slug: string }[]; keys: { id: string; expiresMs: number }[] }>("GET", `api/orgs/${orgId}`)).body;
    expect(org.projects).toHaveLength(4);
    expect(org.keys.filter((k) => keys.some((m) => m.keyId === k.id)).every((k) => k.expiresMs === expiresMs)).toBe(true);
    const batch = { sender: { service: "orders-api", environment: "prod" }, spans: [] };
    const send = await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${keys[0]!.token}` }, body: JSON.stringify(batch) });
    expect(send.status).toBe(204);
    const audit = (await owner.call<{ action: string; detail: { projects: number; keys: number } }[]>("GET", `api/orgs/${orgId}/audit`)).body;
    expect(audit.find((a) => a.action === "project.import")?.detail).toMatchObject({ projects: 3, keys: 4 });
  });

  it("gives clashing slugs their own, and makes nothing when any row is bad", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    const ok = await owner.call<Imported>("POST", `api/orgs/${orgId}/projects/import`, { projects: ["Web App", "web-app!"] });
    expect(ok.body.keys.map((k) => k.slug)).toEqual(["web-app", "web-app-2"]);
    const bad = await owner.call<{ error: string; problems: { row: number }[] }>("POST", `api/orgs/${orgId}/projects/import`, {
      projects: ["fine", { name: "site", kind: "browser", sites: "ftp://nope" }, "", "FINE"],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.problems.map((p) => p.row)).toEqual([2, 3, 4]);
    expect(bad.body.error).toMatch(/^Nothing was made\. Row 2:/);
    expect((await owner.call<{ projects: unknown[] }>("GET", `api/orgs/${orgId}`)).body.projects).toHaveLength(3);
    expect((await owner.call("POST", `api/orgs/${orgId}/projects/import`, { projects: [] })).status).toBe(400);
    const tooMany = Array.from({ length: 501 }, (_, i) => `p${i}`);
    expect((await owner.call<{ error: string }>("POST", `api/orgs/${orgId}/projects/import`, { projects: tooMany })).body.error).toMatch(/up to 500/);
  });
});

describe("project import access", () => {
  it("is for owners and admins only", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId } = await setupOwner(cloud, url);
    const member = await joinWithInvite(url, await invite(owner, orgId, "mo@acme.io", "member"), "mo@acme.io");
    expect((await member.call("POST", `api/orgs/${orgId}/projects/import`, { projects: ["x"] })).status).toBe(403);
  });
});
