import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { Client, invite, joinWithInvite, type Me, setupOwner, startCloud } from "./test/cloud.js";

type Tagged = { id: string; projectId: string; project?: string; name?: string };

let cloud: Cloud;
let url: string;
let owner: Client;
let orgA: string, orgB: string, pa1: string, pa2: string, pb: string, shop: string;

const rule = (name: string) => ({ name, metric: "error_rate", op: ">", threshold: 5, windowMs: 300_000, channels: [{ kind: "email", to: ["owner@acme.io"] }] });

beforeEach(async () => {
  ({ cloud, url } = await startCloud());
  ({ owner, orgId: orgA, projectId: pa1 } = await setupOwner(cloud, url));
  pa2 = (await owner.call<{ id: string }>("POST", `api/orgs/${orgA}/projects`, { name: "Admin" })).body.id;
  orgB = (await owner.call<{ id: string }>("POST", "api/orgs", { name: "Beta" })).body.id;
  const me = (await owner.call<Me>("GET", "api/me")).body;
  pb = me.orgs.find((o) => o.id === orgB)!.projects[0]!.id;
  shop = me.orgs.find((o) => o.id === orgA)!.projects.find((p) => p.id === pa1)!.name;
  for (const [p, name] of [[pa1, "Shop errors"], [pa2, "Admin errors"], [pb, "Beta errors"]] as const) {
    expect((await owner.call("POST", `api/projects/${p}/alerts`, rule(name))).status).toBe(201);
  }
});

afterEach(async () => {
  await cloud?.close();
});

describe("Lists across an organization", () => {
  it("list every project's alert rules with their project, and none of another organization", async () => {
    const { rules } = (await owner.call<{ rules: Tagged[] }>("GET", `api/orgs/${orgA}/alerts`)).body;
    expect(rules.map((r) => [r.name, r.project]).sort()).toEqual([["Admin errors", "Admin"], ["Shop errors", shop]].sort());
    expect(rules.find((r) => r.name === "Admin errors")!.projectId).toBe(pa2);
  });

  it("leave out projects a person may not see", async () => {
    const vic = await joinWithInvite(url, await invite(owner, orgA, "vic@acme.io", "member"), "vic@acme.io");
    const vicId = (await vic.call<Me>("GET", "api/me")).body.user!.id;
    await owner.call("PUT", `api/orgs/${orgA}/projects/${pa2}/roles/${vicId}`, { role: "none" });
    const { rules } = (await vic.call<{ rules: Tagged[] }>("GET", `api/orgs/${orgA}/alerts`)).body;
    expect(rules.map((r) => r.name)).toEqual(["Shop errors"]);
    expect((await vic.call("GET", `api/orgs/${orgB}/alerts`)).status).toBe(404);
  });

  it("keep saved items of the whole organization beside each project's", async () => {
    const own = await owner.call<Tagged>("POST", `api/orgs/${orgA}/saved`, { kind: "view", name: "Everything failing", href: "#/errors?project=all", shared: true });
    expect([own.status, own.body.projectId]).toEqual([201, ""]);
    await owner.call("POST", `api/projects/${pa2}/saved`, { kind: "view", name: "Admin errors", href: "#/errors", shared: true });
    await owner.call("POST", `api/projects/${pb}/saved`, { kind: "view", name: "Beta errors", href: "#/errors", shared: true });
    const { items } = (await owner.call<{ items: Tagged[] }>("GET", `api/orgs/${orgA}/saved`)).body;
    expect(items.map((i) => [i.name, i.project ?? null])).toEqual([["Everything failing", null], ["Admin errors", "Admin"]]);
    expect((await owner.call("PATCH", `api/orgs/${orgA}/saved/${own.body.id}`, { name: "All failing" })).status).toBe(200);
    expect((await owner.call("DELETE", `api/orgs/${orgB}/saved/${own.body.id}`)).status).toBe(404);
    expect((await owner.call("DELETE", `api/orgs/${orgA}/saved/${own.body.id}`)).status).toBe(200);
  });

  it("list share links, issues, SLOs, and uptime checks the same way", async () => {
    await owner.call("POST", `api/projects/${pa2}/issues`, { kind: "insight", key: "n+1", action: "resolve" });
    const { issues } = (await owner.call<{ issues: Tagged[] }>("GET", `api/orgs/${orgA}/issues`)).body;
    expect(issues.map((i) => i.project)).toEqual(["Admin"]);
    // An insight adds up across projects, so a change under All projects lands in each one.
    expect((await owner.call("POST", `api/orgs/${orgA}/issues`, { kind: "insight", key: "slow-db", action: "resolve" })).status).toBe(200);
    const after = (await owner.call<{ issues: Tagged[] }>("GET", `api/orgs/${orgA}/issues`)).body.issues;
    expect(after.filter((i) => (i as unknown as { key: string }).key === "slow-db").map((i) => i.project).sort()).toEqual(["Admin", shop].sort());
    for (const path of ["slos", "uptime", "shares"]) expect((await owner.call("GET", `api/orgs/${orgA}/${path}`)).status).toBe(200);
    expect((await owner.call<Tagged[]>("GET", `api/orgs/${orgA}/shares`)).body).toEqual([]);
  });
});
