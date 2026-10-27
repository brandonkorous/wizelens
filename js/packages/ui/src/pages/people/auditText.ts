import type { OrgData } from "../organization/orgTypes";

export interface AuditEntry {
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  timeMs: number;
}

/** Each audit action in words. Unknown actions show as they are. */
const ACTIONS: Record<string, string> = {
  "org.create": "Created the organization",
  "org.update": "Changed the organization",
  "member.invite": "Invited someone",
  "member.join": "Joined",
  "member.leave": "Left",
  "member.remove": "Removed a member",
  "member.role": "Changed a role",
  "invite.cancel": "Cancelled an invite",
  "project.create": "Added a project",
  "project.import": "Imported projects and keys",
  "project.clear": "Cleared a project's data",
  "project.delete": "Deleted a project",
  "project.update": "Changed a project's settings",
  "project.rename": "Renamed a project",
  "service.forget": "Forgot offline hosts",
  "key.create": "Made a key",
  "key.revoke": "Revoked a key",
  "key.rotate": "Rotated a key",
  "key.rotate_many": "Rotated many keys",
  "key.revoke_many": "Revoked many keys",
  "project.role": "Changed access to a project",
  "project.settings": "Changed project settings",
  "project.settings_copy": "Copied project settings",
  "slo.create": "Added an SLO",
  "slo.delete": "Deleted an SLO",
  "issue.resolve": "Resolved an issue",
  "issue.ignore": "Ignored an issue",
  "issue.reopen": "Reopened an issue",
  "issue.assign": "Assigned an issue",
  "share.create": "Shared a trace",
  "share.revoke": "Revoked a shared link",
  "sso.create": "Added an identity provider",
  "sso.update": "Changed an identity provider",
  "sso.delete": "Removed an identity provider",
  "sso.verify": "Proved a single sign-on domain",
  "mcp.call": "AI agent read data",
  "app.connect": "Connected an app",
  "app.disconnect": "Disconnected an app",
  "uptime.create": "Added an uptime check",
  "uptime.update": "Changed an uptime check",
  "uptime.delete": "Deleted an uptime check",
  "status.enable": "Turned on a status page or made a new link",
  "status.disable": "Turned off a status page",
  "plan.change": "Changed the plan",
  "billing.cap": "Set the spend cap",
  "ingest.blocked": "Stopped taking data",
  "audit.export": "Exported the audit log",
  "scim.token.create": "Made a SCIM token",
  "scim.token.revoke": "Revoked a SCIM token",
  "scim.user.create": "SCIM added a person",
  "scim.user.update": "SCIM changed a person",
  "scim.user.delete": "SCIM removed a person",
  "scim.group.create": "SCIM added a group",
  "scim.group.update": "SCIM changed a group",
  "scim.group.delete": "SCIM removed a group",
};

export const actionText = (action: string): string => ACTIONS[action] ?? action;

/** The first part of an action ("key" of "key.create"), in words, for the filter. */
export const GROUP_LABEL: Record<string, string> = {
  org: "Organization",
  member: "Members",
  invite: "Invites",
  project: "Projects",
  key: "API keys",
  share: "Shared links",
  sso: "Single sign-on",
  mcp: "AI agents",
  app: "Connected apps",
  slo: "SLOs",
  issue: "Issues",
  service: "Services",
  audit: "Audit log",
  plan: "Plan",
  billing: "Billing",
  ingest: "Data intake",
  scim: "SCIM",
};

/** Names for the ids an entry can hold: people, keys, and projects. */
export function namesOf(data: OrgData | null) {
  const people = new Map((data?.members ?? []).map((m) => [m.userId, m.name]));
  const keys = new Map((data?.keys ?? []).map((k) => [k.id, k.name]));
  const projects = new Map((data?.projects ?? []).map((p) => [p.id, p.name]));
  return { people, keys, projects };
}

type Names = ReturnType<typeof namesOf>;

/** Who did it: a person's name, a key's name, or "WizeLens" for the system. */
export function actorText(actor: string, names: Names): string {
  const [kind, id = ""] = actor.split(":");
  if (kind === "user") return names.people.get(id) ?? "Former member";
  if (kind === "key") return names.keys.has(id) ? `Key ${names.keys.get(id)}` : "Revoked key";
  if (kind === "scim") return "Identity provider (SCIM)";
  if (kind === "stripe") return "Stripe";
  return "WizeLens";
}

const project = (id: unknown, names: Names) => (typeof id === "string" ? (names.projects.get(id) ?? "deleted project") : null);

/** The useful facts of an entry, in words. Ids become names; the organization id and raw lines are left out. */
export function detailText(d: Record<string, unknown>, names: Names): string {
  const parts: string[] = [];
  if (typeof d.keyId === "string" && names.keys.has(d.keyId)) parts.push(names.keys.get(d.keyId)!);
  if (typeof d.app === "string") parts.push(`with ${d.app}`);
  if (d.allProjects === true) parts.push("all projects");
  if (typeof d.userEmail === "string") parts.push(`for ${d.userEmail}`);
  if (typeof d.name === "string") parts.push(d.name);
  if (typeof d.title === "string") parts.push(d.title);
  if (typeof d.url === "string") parts.push(d.url);
  if (typeof d.email === "string") parts.push(d.email);
  if (typeof d.role === "string") parts.push(d.role === "none" ? "no access" : `as ${d.role}`);
  if (typeof d.kind === "string") parts.push(`${d.kind} key`);
  const p = project(d.projectId, names);
  if (p && p !== d.name) parts.push(`project ${p}`);
  if (typeof d.from === "string" && typeof d.to === "string") parts.push(`was ${d.from}`);
  if (Array.isArray(d.projectIds)) parts.push(`for ${d.projectIds.map((id) => project(id, names)).join(", ")}`);
  if (typeof d.providerId === "string") parts.push(d.providerId);
  if (typeof d.retentionDays === "number") parts.push(`keep data ${d.retentionDays} days`);
  if (typeof d.logRetentionDays === "number") parts.push(`keep logs ${d.logRetentionDays} days`);
  if (d.logRetentionDays === null) parts.push("logs follow the organization");
  if (typeof d.slowQueryMs === "number") parts.push(`slow query ${d.slowQueryMs} ms`);
  if (typeof d.nPlusOneThreshold === "number") parts.push(`N+1 at ${d.nPlusOneThreshold}`);
  if (Array.isArray(d.redactKeys)) parts.push(`redact ${d.redactKeys.join(", ")}`);
  if (typeof d.userId === "string" && "role" in d) parts.push(`for ${names.people.get(d.userId) ?? "a former member"}`);
  if ("role" in d && d.role === null) parts.push("back to the organization role");
  if (typeof d.lines === "number") parts.push(`${d.lines} lines`);
  if (typeof d.days === "number") parts.push(`for ${d.days} days`);
  if (typeof d.plan === "string") parts.push(`${typeof d.from === "string" ? `${d.from} to ` : ""}${d.plan}`);
  if (d.capUsd !== undefined) parts.push(d.capUsd === null ? "no cap" : `$${String(d.capUsd)} a month`);
  if (typeof d.reason === "string") parts.push(d.reason === "cap" ? "spend cap reached" : "Free plan data used up");
  if (typeof d.userName === "string") parts.push(d.userName);
  if (typeof d.format === "string") parts.push(d.format.toUpperCase());
  if (typeof d.removed === "number") parts.push(`${d.removed} ${d.removed === 1 ? "host" : "hosts"}`);
  if (typeof d.line === "string" && parts.length === 0) parts.push(d.line);
  return parts.join(" · ");
}
