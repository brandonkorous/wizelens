import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Db, openPglite, openPostgres } from "../db/db.js";
import { splitStatements } from "../db/migrate.js";
import { MIGRATIONS, MIGRATIONS_TABLE } from "../db/schema.js";
import type { Cloud } from "../server.js";
import { Client, type Me, startCloud } from "../test/cloud.js";

let cloud: Cloud | undefined;
let dir: string | undefined;
afterEach(async () => {
  await cloud?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  cloud = dir = undefined;
});

/** A password hash as the cloud wrote it before Better Auth. */
function legacyHash(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

const OLD_PASSWORD = "an old password";

/** Set WIZELENS_TEST_PG to an empty Postgres to run the upgrade there too (its public schema is wiped). */
const PG = process.env.WIZELENS_TEST_PG;
const SECRET = "upgrade-test-secret-0123456789abcdefghij";

async function emptyPostgres(url: string): Promise<Db> {
  const db = await openPostgres(url);
  await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  return db;
}

/** A database at schema 3 with one owner, an organization, a project, and an open invite. */
async function legacyDatabase(open: () => Promise<Db>): Promise<{ userId: string; orgId: string; projectId: string }> {
  const db = await open();
  await db.exec(MIGRATIONS_TABLE);
  for (let v = 1; v <= 3; v++) {
    for (const s of splitStatements(MIGRATIONS[v - 1]!)) await db.query(s);
    await db.query("INSERT INTO wizelens_migrations (version, applied_ms) VALUES ($1, 1)", [v]);
  }
  const [userId, orgId, projectId] = [randomUUID(), randomUUID(), randomUUID()];
  await db.query("INSERT INTO users (id, email, name, password_hash, created_ms) VALUES ($1, 'Old@Acme.io', 'Old', $2, 1000)", [userId, legacyHash(OLD_PASSWORD)]);
  await db.query("INSERT INTO orgs (id, name, slug, retention_days, created_ms) VALUES ($1, 'Acme', 'acme', 45, 1000)", [orgId]);
  await db.query("INSERT INTO members (org_id, user_id, role, created_ms) VALUES ($1, $2, 'owner', 1000)", [orgId, userId]);
  await db.query("INSERT INTO projects (id, org_id, name, slug, created_ms) VALUES ($1, $2, 'Shop', 'shop', 1000)", [projectId, orgId]);
  await db.query("INSERT INTO invites (token_hash, org_id, email, role, created_by, created_ms, expires_ms) VALUES ('h', $1, 'new@acme.io', 'member', $2, 1000, $3)", [orgId, userId, Date.now() + 86_400_000]);
  await db.close();
  return { userId, orgId, projectId };
}

const targets: [string, () => Promise<{ database: string; open: () => Promise<Db> }>][] = [
  ["PGlite", async () => ((dir = mkdtempSync(join(tmpdir(), "wl-upgrade-"))), { database: `pglite:${dir}`, open: () => openPglite(dir) })],
  ...(PG ? [["Postgres", async () => ({ database: PG, open: () => emptyPostgres(PG) })] as [string, () => Promise<{ database: string; open: () => Promise<Db> }>]] : []),
];

describe.each(targets)("upgrading to Better Auth on %s", (_name, target) => {
  it("keeps people, organizations, projects, and invites; old passwords work and get a new hash", async () => {
    const { database, open } = await target();
    const legacy = await legacyDatabase(open);
    let url: string;
    ({ cloud, url } = await startCloud({ database, authSecret: SECRET }));
    expect(cloud.setupLink()).toBeNull();
    const c = new Client(url);
    expect((await c.call("POST", "api/auth/sign-in/email", { email: "old@acme.io", password: "not the password" })).status).toBe(401);
    expect((await c.call("POST", "api/auth/sign-in/email", { email: "old@acme.io", password: OLD_PASSWORD })).status).toBe(200);
    const me = (await c.call<Me & { orgs: { retentionDays: number }[] }>("GET", "api/me")).body;
    expect(me.user).toMatchObject({ id: legacy.userId, email: "old@acme.io", emailVerified: true });
    expect(me.orgs[0]).toMatchObject({ id: legacy.orgId, role: "owner", retentionDays: 45, projects: [{ id: legacy.projectId }] });
    const [account] = await cloud.app.db.query<{ password: string }>("SELECT password FROM accounts WHERE user_id = $1", [legacy.userId]);
    expect(account!.password.startsWith("scrypt$")).toBe(false);
    const org = (await c.call<{ invites: { email: string }[] }>("GET", `api/orgs/${legacy.orgId}`)).body;
    expect(org.invites.map((i) => i.email)).toEqual(["new@acme.io"]);
    expect((await new Client(url).call("POST", "api/auth/sign-in/email", { email: "old@acme.io", password: OLD_PASSWORD })).status).toBe(200);
  });
});
