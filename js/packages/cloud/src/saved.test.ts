import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { Client, invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

describe("cloud saved items and page links", () => {
  it("keeps own items private until shared, lets only the owner change them, and admins delete shared ones", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const base = `api/projects/${projectId}/saved`;
    const ann = await joinWithInvite(url, await invite(owner, orgId, "ann@acme.io", "member"), "ann@acme.io", "Ann");
    const mine = await ann.call<{ id: string; ownerName: string }>("POST", base, { kind: "view", name: "API errors", href: "#/errors?service=api" });
    expect(mine.body.ownerName).toBe("Ann");
    expect((await owner.call<{ items: unknown[] }>("GET", base)).body.items).toEqual([]);
    expect((await ann.call("PATCH", `${base}/${mine.body.id}`, { shared: true })).status).toBe(200);
    expect((await owner.call<{ items: { name: string }[] }>("GET", base)).body.items.map((i) => i.name)).toEqual(["API errors"]);
    expect((await owner.call("PATCH", `${base}/${mine.body.id}`, { name: "Mine now" })).status).toBe(403);
    const dash = { kind: "dashboard", name: "Runtime", panels: [{ type: "line", metrics: [{ name: "process.cpu.utilization", stat: "" }], where: "service=api", group: "", width: 2 }] };
    expect((await ann.call<{ panels: { id: string }[] }>("POST", base, dash)).body.panels[0]!.id).toBe("p1");
    expect((await ann.call<{ error: string }>("POST", base, { ...dash, panels: [{ type: "pie", metrics: [] }] })).body.error).toMatch(/type/);
    expect((await ann.call<{ error: string }>("POST", base, { kind: "view", name: "x", href: "https://evil" })).body.error).toMatch(/#\//);
    expect((await owner.call("DELETE", `${base}/${mine.body.id}`)).status).toBe(200);
  }, 60_000);

  it("shares a page as it is now, for anyone with the link", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, projectId } = await setupOwner(cloud, url);
    const made = await owner.call<{ url: string }>("POST", `api/projects/${projectId}/shares`, { page: "errors", range: "24h", params: { sort: "count" }, title: "Errors this week", days: 3 });
    expect(made.status).toBe(201);
    const token = made.body.url.split("/shared/")[1]!;
    const shared = await new Client(url).call<{ page: string; title: string; model: { filter: { sort: string } } }>("GET", `api/shared/${token}`);
    expect(shared.body).toMatchObject({ page: "errors", title: "Errors this week", model: { filter: { sort: "count" } } });
    expect((await owner.call<{ error: string }>("POST", `api/projects/${projectId}/shares`, { page: "team", days: 3 })).body.error).toMatch(/cannot be shared/);
    const list = await owner.call<{ page: string; traceId: string }[]>("GET", `api/projects/${projectId}/shares`);
    expect(list.body).toMatchObject([{ page: "errors", traceId: "" }]);
  }, 60_000);
});
