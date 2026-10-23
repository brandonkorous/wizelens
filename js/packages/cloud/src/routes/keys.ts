// API keys of an organization: create (with scopes and an expiry), rotate (the old secret works for a grace period), and revoke.
import type { Ctx } from "../app.js";
import { requireOrg } from "../auth/principal.js";
import { fail, readJsonBody, sendJson, str } from "../http/http.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { originsFor } from "../repo/key-origins.js";
import { createKey, keyInOrg, type KeyKind, listProjects, revokeKey, rotateKey, scopesFor, setKeyOrigins } from "../repo/projects.js";

const DAY_MS = 86_400_000;
const MAX_DAYS = 3650;
/** How long a rotated key's old secret keeps working, unless the body sets `graceHours` (0 to 168). */
const GRACE_HOURS = 24;
const now = (ctx: Ctx) => ctx.app.config.now();

export function daysOf(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) fail(400, `A key expires in 1 to ${MAX_DAYS} days, or never.`);
  return n;
}

/** Run a check that throws a message for people; the message becomes a 400. */
function checked<T>(check: () => T, fallback: string): T {
  try {
    return check();
  } catch (err) {
    return fail(400, err instanceof Error ? err.message : fallback);
  }
}

const scopesOf = (kind: KeyKind, raw: unknown) => checked(() => scopesFor(kind, raw), "Invalid scopes.");
const originsOf = (kind: KeyKind, raw: unknown) => (kind === "browser" ? checked(() => originsFor(raw), "Invalid sites.") : null);

/** Ingest and browser keys belong to one project; a browser key also lists its sites. Read keys name the projects they may read. */
async function newKey(ctx: Ctx): Promise<void> {
  const org = ctx.params.org!;
  const { user } = await requireOrg(ctx, org, "manage");
  const body = await readJsonBody(ctx.req);
  const kind = body.kind as KeyKind;
  if (kind !== "ingest" && kind !== "read" && kind !== "browser") fail(400, 'Set kind to "ingest", "read", or "browser".');
  const known = new Set((await listProjects(ctx.app.db, org)).map((p) => p.id));
  const ids = Array.isArray(body.projectIds) ? body.projectIds.filter((id): id is string => typeof id === "string" && known.has(id)) : [];
  if (ids.length === 0 || (kind !== "read" && ids.length !== 1)) fail(400, "Pick one project for an ingest or browser key, or one or more for a read key.");
  const scopes = scopesOf(kind, body.scopes);
  const origins = originsOf(kind, body.origins);
  const days = daysOf(body.expiresInDays);
  const expiresMs = days === null ? null : now(ctx) + days * DAY_MS;
  const key = await createKey(ctx.app.db, org, kind, str(body, "name", false), ids, user.id, now(ctx), { scopes, expiresMs, origins });
  await audit(ctx.app.db, org, `user:${user.id}`, "key.create", { keyId: key.id, kind, projectIds: ids, scopes, expiresMs, origins }, now(ctx));
  sendJson(ctx.res, 201, { ...key, expiresMs, origins });
}

/** A new secret for the same key; the old one stops after the grace period. */
async function rotate(ctx: Ctx): Promise<void> {
  const { org, key: keyId } = ctx.params as { org: string; key: string };
  const { user } = await requireOrg(ctx, org, "manage");
  const old = await keyInOrg(ctx.app.db, org, keyId);
  if (!old) return fail(404, "Key not found.");
  const hours = Number((await readJsonBody(ctx.req)).graceHours ?? GRACE_HOURS);
  if (!Number.isFinite(hours) || hours < 0 || hours > 168) fail(400, "The grace period is 0 to 168 hours.");
  const key = await ctx.app.db.tx((q) => rotateKey(q, org, old, user.id, now(ctx), hours * 3_600_000));
  await audit(ctx.app.db, org, `user:${user.id}`, "key.rotate", { keyId: key.id, from: old.id, graceHours: hours }, now(ctx));
  sendJson(ctx.res, 201, key);
}

/** A browser key's sites, changed in place: the secret in page code stays the same. */
async function editOrigins(ctx: Ctx): Promise<void> {
  const { org, key } = ctx.params as { org: string; key: string };
  const { user } = await requireOrg(ctx, org, "manage");
  const origins = originsOf("browser", (await readJsonBody(ctx.req)).origins)!;
  if (!(await setKeyOrigins(ctx.app.db, org, key, origins))) fail(404, "Browser key not found.");
  await audit(ctx.app.db, org, `user:${user.id}`, "key.origins", { keyId: key, origins }, now(ctx));
  sendJson(ctx.res, 200, { origins });
}

async function dropKey(ctx: Ctx): Promise<void> {
  const { org, key } = ctx.params as { org: string; key: string };
  const { user } = await requireOrg(ctx, org, "manage");
  if (!(await revokeKey(ctx.app.db, org, key, now(ctx)))) fail(404, "Key not found.");
  await audit(ctx.app.db, org, `user:${user.id}`, "key.revoke", { keyId: key }, now(ctx));
  sendJson(ctx.res, 200, { ok: true });
}

export function keyRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs/:org/keys", newKey).on("POST", "api/orgs/:org/keys/:key/rotate", rotate).on("PATCH", "api/orgs/:org/keys/:key", editOrigins).on("DELETE", "api/orgs/:org/keys/:key", dropKey);
}
