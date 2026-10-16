import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/db.js";
import { migrate } from "../db/migrate.js";
import { span, T1, T2, testDb } from "../test/db.js";
import { acceptInvite, createInvite, createOrg, listMembers, orgsOfUser } from "./orgs.js";
import { createKey, createProject, keyByToken, revokeKey } from "./projects.js";
import { countTraces, getTrace, listServices, queryTraces } from "./trace-read.js";
import { pruneByRetention, writeBatch } from "./trace-write.js";
import { createSession, createUser, userBySession, verifyLogin } from "./users.js";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
afterAll(() => db.close());

describe("cloud data", () => {
  it("runs migrations once", async () => {
    expect(await migrate(db)).toBe(0);
  });

  it("signs users in and keeps sessions", async () => {
    const u = await createUser(db, "Ada@Example.com", "correct horse battery", "Ada", 1);
    expect(await verifyLogin(db, "ada@example.com", "correct horse battery")).toMatchObject({ id: u.id });
    expect(await verifyLogin(db, "ada@example.com", "wrong password!!")).toBeUndefined();
    const { token } = await createSession(db, u.id, 1);
    expect(await userBySession(db, token, 2)).toMatchObject({ email: "ada@example.com" });
  });

  it("makes orgs, invites members, and checks keys", async () => {
    const owner = await createUser(db, "owner@x.io", "long enough pw", "Owner", 1);
    const org = await createOrg(db, "Acme Shop", owner.id, 1);
    const invite = await createInvite(db, org.id, "bob@x.io", "member", owner.id, 1);
    const bob = await createUser(db, "bob@x.io", "long enough pw", "Bob", 1);
    expect(await acceptInvite(db, invite, bob.id, 2)).toMatchObject({ orgName: "Acme Shop", role: "member" });
    expect(await acceptInvite(db, invite, bob.id, 3)).toBeUndefined();
    expect((await listMembers(db, org.id)).map((m) => m.role).sort()).toEqual(["member", "owner"]);
    expect((await orgsOfUser(db, bob.id))[0]).toMatchObject({ slug: "acme-shop", role: "member" });
    const p = await createProject(db, org.id, "Web", 1);
    const { id, token } = await createKey(db, org.id, "ingest", "ci", [p.id], owner.id, 1);
    expect(await keyByToken(db, token, 5)).toMatchObject({ kind: "ingest", projectIds: [p.id], orgId: org.id });
    await revokeKey(db, org.id, id, 6);
    expect(await keyByToken(db, token, 7)).toBeUndefined();
  });

  it("writes and reads traces per project, and prunes by retention", async () => {
    const owner = await createUser(db, "t@x.io", "long enough pw", "T", 1);
    const org = await createOrg(db, "Tracer", owner.id, 1, 1);
    const p = await createProject(db, org.id, "Api", 1);
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
