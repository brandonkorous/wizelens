// Many keys at once: rotate them (new secrets, answered once) or revoke them, for a leak or a rotation policy.
import type { Ctx } from "../app.js";
import { requireOrg } from "../auth/principal.js";
import { fail, readJsonBody, sendJson } from "../http/http.js";
import { idsOf } from "../http/ids.js";
import type { Router } from "../http/router.js";
import { audit } from "../repo/audit.js";
import { keysInOrg, revokeKeys, rotateKey } from "../repo/projects.js";

const GRACE_HOURS = 24;

function graceOf(raw: unknown): number {
  const hours = Number(raw ?? GRACE_HOURS);
  if (!Number.isFinite(hours) || hours < 0 || hours > 168) fail(400, "The grace period is 0 to 168 hours.");
  return hours;
}

/** `POST api/orgs/:org/keys/rotate`: `{ keyIds, graceHours? }`. Ids that are not live keys of the organization come back as `missing`. */
async function rotateMany(ctx: Ctx): Promise<void> {
  const org = ctx.params.org!;
  const { user } = await requireOrg(ctx, org, "manage");
  const body = await readJsonBody(ctx.req);
  const ids = idsOf(body.keyIds, "keys");
  const hours = graceOf(body.graceHours);
  const now = ctx.app.config.now();
  const keys = await ctx.app.db.tx(async (q) => {
    const found = await keysInOrg(q, org, ids);
    const out = [];
    for (const old of found) {
      const made = await rotateKey(q, org, old, user.id, now, hours * 3_600_000);
      out.push({ ...made, oldId: old.id, name: old.name, kind: old.kind, projectIds: old.projectIds });
    }
    return out;
  });
  const missing = ids.filter((id) => !keys.some((k) => k.oldId === id));
  await audit(ctx.app.db, org, `user:${user.id}`, "key.rotate_many", { keyIds: keys.map((k) => k.oldId), newKeyIds: keys.map((k) => k.id), graceHours: hours }, now);
  sendJson(ctx.res, 201, { keys, missing });
}

/** `POST api/orgs/:org/keys/revoke`: `{ keyIds }`. Apps that send with these keys stop being recorded at once. */
async function revokeMany(ctx: Ctx): Promise<void> {
  const org = ctx.params.org!;
  const { user } = await requireOrg(ctx, org, "manage");
  const ids = idsOf((await readJsonBody(ctx.req)).keyIds, "keys");
  const now = ctx.app.config.now();
  const named = new Map((await keysInOrg(ctx.app.db, org, ids)).map((k) => [k.id, k.name]));
  const revoked = await revokeKeys(ctx.app.db, org, ids, now);
  if (revoked.length) await audit(ctx.app.db, org, `user:${user.id}`, "key.revoke_many", { keyIds: revoked, keyNames: revoked.map((id) => named.get(id) ?? id) }, now);
  sendJson(ctx.res, 200, { revoked, missing: ids.filter((id) => !revoked.includes(id)) });
}

export function keyBulkRoutes(r: Router<Ctx>): void {
  r.on("POST", "api/orgs/:org/keys/rotate", rotateMany).on("POST", "api/orgs/:org/keys/revoke", revokeMany);
}
