import { afterEach, describe, expect, it } from "vitest";
import { REDACTED } from "@wizeworks/lens-core";
import type { Cloud } from "./server.js";
import { Client, invite, joinWithInvite, type Me, setupOwner, startCloud } from "./test/cloud.js";
import { span, T1 } from "./test/db.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const DAY = 86_400_000;

async function start() {
  let url: string;
  ({ cloud, url } = await startCloud());
  return { url, ...(await setupOwner(cloud, url)) };
}

const ingest = (url: string, key: string, body: unknown) => fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });

describe("project settings", () => {
  it("are checked, saved, and hide a project's extra keys on ingest", async () => {
    const { url, owner, orgId, projectId } = await start();
    const path = `api/projects/${projectId}/settings`;
    expect((await owner.call<{ defaults: { retentionDays: number } }>("GET", path)).body.defaults.retentionDays).toBe(30);
    expect((await owner.call<{ error: string }>("PUT", path, { retentionDays: 31 })).body.error).toMatch(/1 to 30/);
    const saved = await owner.call<{ effective: { slowQueryMs: number; retentionDays: number } }>("PUT", path, { slowQueryMs: 40, redactKeys: ["ssn"], retentionDays: 7 });
    expect(saved.body.effective).toMatchObject({ slowQueryMs: 40, retentionDays: 7 });
    const info = (await owner.call<{ capabilities: string[]; storage: { maxAgeMs: number }; analysis: { slowQueryMs: number } }>("GET", `api/info?project=${projectId}`)).body;
    expect(info.capabilities).toContain("settings");
    expect(info).toMatchObject({ storage: { maxAgeMs: 7 * DAY }, analysis: { slowQueryMs: 40 } });
    const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
    await ingest(url, key, { sender: { service: "api" }, spans: [span(T1, "1".repeat(16), { startMs: Date.now() - 1000, attributes: { "user.ssn": "123" } })] });
    const trace = (await owner.call<{ spans: { attributes: Record<string, unknown> }[] }>("GET", `api/traces/${T1}?project=${projectId}`)).body;
    expect(trace.spans[0]!.attributes["user.ssn"]).toBe(REDACTED);
  });
});

describe("roles per project", () => {
  it("hide a project from a member, or let a viewer change one", async () => {
    const { url, owner, orgId, projectId } = await start();
    const other = (await owner.call<{ id: string }>("POST", `api/orgs/${orgId}/projects`, { name: "Second" })).body.id;
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "viewer"), "vic@acme.io");
    const vicId = (await vic.call<Me>("GET", "api/me")).body.user.id;
    expect((await vic.call("PUT", `api/projects/${projectId}/settings`, { slowQueryMs: 9 })).status).toBe(403);
    expect((await owner.call("PUT", `api/orgs/${orgId}/projects/${projectId}/roles/${vicId}`, { role: "admin" })).status).toBe(200);
    expect((await vic.call("PUT", `api/projects/${projectId}/settings`, { slowQueryMs: 9 })).status).toBe(200);
    await owner.call("PUT", `api/orgs/${orgId}/projects/${other}/roles/${vicId}`, { role: "none" });
    const projects = (await vic.call<Me>("GET", "api/me")).body.orgs[0]!.projects.map((p) => p.id);
    expect(projects).toEqual([projectId]);
    expect((await vic.call("GET", `api/info?project=${other}`)).status).toBe(200);
    expect((await vic.call("GET", `api/models/overview?project=${other}&range=24h`)).status).toBe(404);
    const ownerId = (await owner.call<Me>("GET", "api/me")).body.user.id;
    expect((await owner.call("PUT", `api/orgs/${orgId}/projects/${other}/roles/${ownerId}`, { role: "none" })).status).toBe(400);
    const roles = (await owner.call<{ projectRoles: { role: string }[] }>("GET", `api/orgs/${orgId}`)).body.projectRoles;
    expect(roles.map((r) => r.role).sort()).toEqual(["admin", "none"]);
  });
});

describe("API keys", () => {
  it("expire, keep to their scopes, and rotate with a grace period", async () => {
    const { url, owner, orgId, projectId } = await start();
    const make = (body: object) => owner.call<{ id: string; token: string; expiresMs: number | null }>("POST", `api/orgs/${orgId}/keys`, { projectIds: [projectId], ...body });
    expect((await make({ kind: "read", scopes: ["nope"] })).status).toBe(400);
    const logsOnly = (await make({ kind: "ingest", scopes: ["logs"] })).body.token;
    expect((await ingest(url, logsOnly, { sender: { service: "api" }, spans: [span(T1, "1".repeat(16))] })).status).toBe(204);
    expect((await fetch(`${url}/_wizelens/v1/traces`, { method: "POST", headers: { Authorization: `Bearer ${logsOnly}`, "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    const mcpOnly = (await make({ kind: "read", scopes: ["mcp"] })).body.token;
    expect((await new Client(url).call("GET", `api/info?project=${projectId}`, undefined, { Authorization: `Bearer ${mcpOnly}` })).status).toBe(200);
    expect((await new Client(url).call("GET", `api/models/overview?project=${projectId}&range=24h`, undefined, { Authorization: `Bearer ${mcpOnly}` })).status).toBe(401);
    const short = await make({ kind: "read", expiresInDays: 30 });
    expect(short.body.expiresMs).toBeGreaterThan(Date.now() + 29 * DAY);
    const rotated = await owner.call<{ token: string; oldExpiresMs: number }>("POST", `api/orgs/${orgId}/keys/${short.body.id}/rotate`, { graceHours: 0 });
    const read = (token: string) => new Client(url).call("GET", `api/models/overview?project=${projectId}&range=24h`, undefined, { Authorization: `Bearer ${token}` });
    expect((await read(rotated.body.token)).status).toBe(200);
    expect((await read(short.body.token)).status).toBe(401);
    const keys = (await owner.call<{ keys: { rotatedFrom: string | null; expiresMs: number | null }[] }>("GET", `api/orgs/${orgId}`)).body.keys;
    expect(keys.find((k) => k.rotatedFrom === short.body.id)!.expiresMs).toBeGreaterThan(Date.now() + 29 * DAY);
  });
});

describe("projects", () => {
  it("renames a project, keeps its id and slug, and logs who renamed it", async () => {
    const { owner, orgId, projectId } = await start();
    const patch = (body: unknown) => owner.call<{ id: string; name: string; slug: string }>("PATCH", `api/orgs/${orgId}/projects/${projectId}`, body);
    const before = (await owner.call<{ projects: { id: string; slug: string }[] }>("GET", `api/orgs/${orgId}`)).body.projects[0]!;
    const renamed = (await patch({ name: "  kanninja-production " })).body;
    expect(renamed).toMatchObject({ id: projectId, name: "kanninja-production", slug: before.slug });
    expect((await patch({ name: " " })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    const log = (await owner.call<{ action: string; detail: { to: string } }[]>("GET", `api/orgs/${orgId}/audit?action=project.rename`)).body;
    expect(log.map((e) => e.detail.to)).toEqual(["kanninja-production"]);
  });
});

describe("audit log", () => {
  it("pages back, filters by action and actor, and exports CSV", async () => {
    const { owner, orgId } = await start();
    for (let i = 0; i < 3; i++) await owner.call("POST", `api/orgs/${orgId}/projects`, { name: `P${i}` });
    const page = (q: string) => owner.call<{ action: string; timeMs: number }[]>("GET", `api/orgs/${orgId}/audit?${q}`);
    const first = (await page("limit=2")).body;
    expect(first).toHaveLength(2);
    const next = (await page(`limit=2&before=${first[1]!.timeMs}`)).body;
    expect(next[0]!.timeMs).toBeLessThan(first[1]!.timeMs);
    expect((await page("limit=2&offset=2")).body[0]).toEqual((await page("limit=3")).body[2]);
    const total = (await owner.call<{ total: number }>("GET", `api/orgs/${orgId}/audit/count?action=project.create`)).body.total;
    expect(total).toBe(3);
    expect((await page("action=project.")).body.every((e) => e.action.startsWith("project."))).toBe(true);
    const facets = (await owner.call<{ actions: string[]; actors: string[] }>("GET", `api/orgs/${orgId}/audit/facets`)).body;
    expect(facets.actions).toContain("project.create");
    expect((await page(`actor=${encodeURIComponent(facets.actors[0]!)}`)).body.length).toBeGreaterThan(0);
    const csv = await owner.call<string>("GET", `api/orgs/${orgId}/audit/export?format=csv&action=project.create`);
    expect(csv.body.split("\n")[0]).toBe("time,actor,action,detail");
    expect(csv.body.match(/project\.create/g)).toHaveLength(3);
  });
});
