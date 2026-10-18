import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/db.js";
import { migrate } from "../db/migrate.js";
import { seedOrg, span, T1, T2, testDb } from "../test/db.js";
import { deleteOrgEverything, listMembers, orgsOfUser } from "./orgs.js";
import { createKey, createProject, keyByToken, revokeKey } from "./projects.js";
import { countTraces, getTrace, listServices, queryTraces } from "./trace-read.js";
import { pruneByRetention, writeBatch } from "./trace-write.js";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
afterAll(() => db.close());

const addMember = (orgId: string, userId: string, role: string) =>
  db.query("INSERT INTO members (id, org_id, user_id, role, created_at) VALUES ($1, $2, $3, $4, now())", [randomUUID(), orgId, userId, role]);

describe("cloud data", () => {
  it("runs migrations once", async () => {
    expect(await migrate(db)).toBe(0);
  });

  it("lists orgs and members, and checks keys", async () => {
    const { userId, orgId } = await seedOrg(db, "Acme Shop");
    expect((await listMembers(db, orgId)).map((m) => m.role)).toEqual(["owner"]);
    expect((await orgsOfUser(db, userId))[0]).toMatchObject({ name: "Acme Shop", role: "owner", retentionDays: 30 });
    const p = await createProject(db, orgId, "Web", 1);
    const { id, token } = await createKey(db, orgId, "ingest", "ci", [p.id], userId, 1);
    expect(await keyByToken(db, token, 5)).toMatchObject({ kind: "ingest", projectIds: [p.id], orgId });
    await revokeKey(db, orgId, id, 6);
    expect(await keyByToken(db, token, 7)).toBeUndefined();
  });

  it("keeps one owner per organization, even against a direct delete", async () => {
    const { userId, orgId } = await seedOrg(db, "Owned");
    await expect(db.tx((q) => q.query("DELETE FROM members WHERE org_id = $1 AND user_id = $2", [orgId, userId]))).rejects.toThrow(/at least one owner/);
    const other = (await seedOrg(db, "Other")).userId;
    await addMember(orgId, other, "owner");
    await db.tx((q) => q.query("UPDATE members SET role = 'admin' WHERE org_id = $1 AND user_id = $2", [orgId, userId]));
    expect((await listMembers(db, orgId)).map((m) => m.role).sort()).toEqual(["admin", "owner"]);
  });

  it("deletes an organization with all of its data", async () => {
    const { orgId } = await seedOrg(db, "Gone");
    const p = await createProject(db, orgId, "Api", 1);
    await db.tx((q) => writeBatch(q, p.id, { sender: { service: "api" }, via: "addon", spans: [span(T1, "1".repeat(16))], logs: [], remotes: [] }, 10));
    await db.tx((q) => deleteOrgEverything(q, orgId));
    expect(await db.query("SELECT 1 FROM projects WHERE org_id = $1", [orgId])).toEqual([]);
    expect(await db.query("SELECT 1 FROM spans WHERE project_id = $1", [p.id])).toEqual([]);
    expect(await db.query("SELECT 1 FROM members WHERE org_id = $1", [orgId])).toEqual([]);
  });

});

describe("cloud traces", () => {
  it("writes and reads traces per project, and prunes by retention", async () => {
    const { orgId } = await seedOrg(db, "Tracer", 1);
    const p = await createProject(db, orgId, "Api", 1);
    const sender = { service: "orders-api", environment: "prod" };
    const write = { sender, via: "addon" as const, spans: [span(T1, "1".repeat(16)), span(T2, "2".repeat(16), { startMs: 2_000_000 })], logs: [], remotes: [] };
    await db.tx((q) => writeBatch(q, p.id, write, 10));
    await db.tx((q) => writeBatch(q, p.id, write, 11));
    expect((await queryTraces(db, { projectId: p.id, limit: 10 })).map((t) => t.traceId)).toEqual([T2, T1]);
    expect(await getTrace(db, p.id, T1)).toMatchObject({ spanCount: 1 });
    expect(await getTrace(db, "other", T1)).toBeUndefined();
    expect(await countTraces(db, p.id, 0, 1_500_000, "prod")).toBe(1);
    expect((await listServices(db, p.id, 20))[0]).toMatchObject({ service: "orders-api", online: true });
    expect(await pruneByRetention(db, 1_000_000 + 86_400_000 + 1)).toBe(1);
    expect((await queryTraces(db, { projectId: p.id, limit: 10 })).map((t) => t.traceId)).toEqual([T2]);
  });
});
