import type { Queryable } from "../db/db.js";

/** Audit actions that become team notices. MCP calls and the first organization are not news. */
export const NOTICED = new Set([
  "member.invite",
  "invite.cancel",
  "member.join",
  "member.leave",
  "member.remove",
  "member.role",
  "key.create",
  "key.revoke",
  "key.revoke_many",
  "key.rotate_many",
  "sso.create",
  "sso.update",
  "sso.delete",
  "sso.verify",
  "project.create",
  "project.import",
  "project.delete",
  "project.clear",
  "project.update",
  "share.create",
  "share.revoke",
  "status.enable",
  "status.disable",
  "org.update",
  "plan.change",
  "billing.cap",
  "scim.token.create",
  "scim.token.revoke",
]);

export interface AuditRow {
  id: string;
  org_id: string;
  actor: string;
  action: string;
  detail: string;
  time_ms: number;
}

/** Names by id, each looked up once per run. */
export function namesOf(q: Queryable) {
  const cache = new Map<string, Promise<string>>();
  const once = (key: string, load: () => Promise<string>) => cache.get(key) ?? (cache.set(key, load()), cache.get(key)!);
  const one = async (sql: string, id: string, fallback: string) => (await q.query<{ v: string }>(sql, [id]))[0]?.v ?? fallback;
  return {
    user: (id: string) => once(`u:${id}`, () => one("SELECT name || ' (' || email || ')' AS v FROM users WHERE id = $1", id, "Someone")),
    member: (id: string) => once(`m:${id}`, () => one("SELECT u.email AS v FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1", id, "a member")),
    project: (id: string) => once(`p:${id}`, () => one("SELECT name AS v FROM projects WHERE id = $1", id, "a project")),
    key: (id: string) => once(`k:${id}`, () => one("SELECT name AS v FROM api_keys WHERE id = $1", id, "")),
  };
}

export type Names = ReturnType<typeof namesOf>;

const s = (v: unknown) => (typeof v === "string" ? v : "");
/** "3 keys" from a list in the detail. */
const count = (list: unknown, noun: string) => {
  const n = Array.isArray(list) ? list.length : 0;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
};

async function projectsText(names: Names, ids: unknown): Promise<string> {
  const list = Array.isArray(ids) ? await Promise.all(ids.filter((x): x is string => typeof x === "string").map(names.project)) : [];
  return list.length ? list.join(", ") : "no project";
}

/** One sentence per change, naming who did it. */
export async function describe(row: AuditRow, names: Names): Promise<string> {
  const d = JSON.parse(row.detail) as Record<string, unknown>;
  const who = row.actor.startsWith("user:") ? await names.user(row.actor.slice(5)) : "WizeLens";
  const sso = `${s(d.type).toUpperCase() || "single sign-on"} for ${s(d.domain) || s(d.providerId)}`;
  const project = async () => s(d.name) || (await names.project(s(d.projectId)));
  const say: Record<string, () => Promise<string> | string> = {
    "member.invite": () => `${who} invited ${s(d.email)} as ${s(d.role) || "member"}.`,
    "invite.cancel": () => `${who} canceled an invite.`,
    "member.join": () => `${who} joined${d.via === "sso" ? " through single sign-on" : ""}.`,
    "member.leave": () => `${who} left.`,
    "member.remove": () => `${who} removed ${s(d.memberEmail) || s(d.memberIdOrEmail) || "a member"}.`,
    "member.role": async () => `${who} made ${await names.member(s(d.memberId))} ${s(d.role)}.`,
    "key.create": async () => `${who} made ${d.kind === "read" ? "a read key" : d.kind === "browser" ? "a browser key" : "an ingest key"} for ${await projectsText(names, d.projectIds)}.`,
    "key.revoke": async () => `${who} revoked the key ${(await names.key(s(d.keyId))) || s(d.keyId)}.`,
    "key.revoke_many": () => `${who} revoked ${count(d.keyIds, "key")}.`,
    "key.rotate_many": () => `${who} rotated ${count(d.keyIds, "key")}; the old secrets stop in ${Number(d.graceHours) || 0} hours.`,
    "sso.create": () => `${who} added ${sso}.`,
    "sso.update": () => `${who} changed ${sso}.`,
    "sso.delete": () => `${who} removed ${sso}.`,
    "sso.verify": () => `${who} proved the domain for ${sso}.`,
    "project.create": async () => `${who} made the project ${await project()}.`,
    "project.import": () => `${who} imported ${Number(d.keys) || 0} sending keys, with ${Number(d.projects) || 0} new projects.`,
    "project.delete": async () => `${who} deleted the project ${await project()}.`,
    "project.clear": async () => `${who} deleted all data of ${await project()}.`,
    "project.update": async () => `${who} changed the settings of ${await project()}${typeof d.logRetentionDays === "number" ? ` (keep logs ${d.logRetentionDays} days)` : d.logRetentionDays === null ? " (logs follow the organization)" : ""}.`,
    "share.create": async () => `${who} shared a trace from ${await project()} for ${Number(d.days) || 7} days.`,
    "share.revoke": () => `${who} revoked a share link.`,
    "status.enable": async () => `${who} ${d.newLink ? "made a new link for" : "turned on"} the public status page of ${await project()}.`,
    "status.disable": async () => `${who} turned off the public status page of ${await project()}.`,
    "org.update": () => `${who} changed the organization settings${typeof d.retentionDays === "number" ? ` (keep data ${d.retentionDays} days)` : ""}.`,
    "plan.change": () => `The plan changed from ${s(d.from) || "another plan"} to ${s(d.plan)}.`,
    "billing.cap": () => `${who} ${d.capUsd === null ? "removed the spend cap" : `set the spend cap to $${String(d.capUsd)} a month`}.`,
    "scim.token.create": () => `${who} made a SCIM token (${s(d.name)}).`,
    "scim.token.revoke": () => `${who} revoked a SCIM token.`,
  };
  return (await say[row.action]?.()) ?? `${who}: ${row.action}.`;
}
