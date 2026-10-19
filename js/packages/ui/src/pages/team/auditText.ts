import type { OrgData } from "./teamTypes";

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
  "project.clear": "Cleared a project's data",
  "project.delete": "Deleted a project",
  "project.update": "Changed a project's settings",
  "service.forget": "Forgot offline hosts",
  "key.create": "Made a key",
  "key.revoke": "Revoked a key",
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
};

export const actionText = (action: string): string => ACTIONS[action] ?? action;

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
  if (typeof d.role === "string") parts.push(`as ${d.role}`);
  if (typeof d.kind === "string") parts.push(`${d.kind} key`);
  const p = project(d.projectId, names);
  if (p && p !== d.name) parts.push(`project ${p}`);
  if (Array.isArray(d.projectIds)) parts.push(`for ${d.projectIds.map((id) => project(id, names)).join(", ")}`);
  if (typeof d.providerId === "string") parts.push(d.providerId);
  if (typeof d.retentionDays === "number") parts.push(`keep data ${d.retentionDays} days`);
  if (typeof d.logRetentionDays === "number") parts.push(`keep logs ${d.logRetentionDays} days`);
  if (d.logRetentionDays === null) parts.push("logs follow the organization");
  if (typeof d.days === "number") parts.push(`for ${d.days} days`);
  if (typeof d.removed === "number") parts.push(`${d.removed} ${d.removed === 1 ? "host" : "hosts"}`);
  if (typeof d.line === "string" && parts.length === 0) parts.push(d.line);
  return parts.join(" · ");
}
