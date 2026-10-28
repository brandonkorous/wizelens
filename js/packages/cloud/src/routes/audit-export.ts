// The audit log as a file for an examiner: UTC time, who by name and email, what, and whom or what it was about.
import type { Ctx } from "../app.js";
import { requireOrg } from "../auth/principal.js";
import { requireFeature } from "../billing/gate.js";
import { audit, type AuditEntry, auditFilterOf, listAudit } from "../repo/audit.js";

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const str = (v: unknown): v is string => typeof v === "string";

/** Who did it, in words: a person's name, a key's name, or the system. */
function whoOf(e: AuditEntry): string {
  const kind = e.actor.split(":")[0];
  if (kind === "user") return e.who?.name ?? "Deleted account";
  if (kind === "key") return `Key ${e.who?.name ?? "(deleted)"}`;
  if (kind === "scim") return "Identity provider (SCIM)";
  if (kind === "stripe") return "Stripe";
  if (kind === "cli") return "Command line";
  return "WizeLens";
}

/** Whom or what a line was about: people, projects by name, keys, roles. */
function aboutOf(e: AuditEntry, projects: Map<string, string>): string {
  const d = e.detail;
  const parts: string[] = e.subject ? [`${e.subject.name} <${e.subject.email ?? ""}>`] : [];
  for (const k of ["memberEmail", "email", "userEmail"]) if (str(d[k])) parts.push(d[k]);
  const ids = [d.projectId, ...(Array.isArray(d.projectIds) ? d.projectIds : [])].filter(str);
  for (const id of ids) parts.push(`project ${projects.get(id) ?? "(deleted)"}`);
  if (str(d.name) && !parts.includes(`project ${d.name}`)) parts.push(d.name);
  if (str(d.role)) parts.push(`role ${d.role}`);
  return parts.join("; ");
}

/** The audit log as CSV or JSON (Business and Enterprise), with the log's filter (`action`, `actor`, `before`, `from`). The export itself goes in the log too. */
export async function auditExport(ctx: Ctx): Promise<void> {
  const { user } = await requireOrg(ctx, ctx.params.org!, "manage");
  await requireFeature(ctx.app, ctx.params.org!, "auditExport");
  const format = ctx.url.searchParams.get("format") === "json" ? "json" : "csv";
  const filter = auditFilterOf(ctx.url.searchParams);
  await audit(ctx.app.db, ctx.params.org!, `user:${user.id}`, "audit.export", { format, ...filter }, ctx.app.config.now());
  const rows = await listAudit(ctx.app.db, ctx.params.org!, 100_000, filter);
  const projects = new Map((await ctx.app.db.query<{ id: string; name: string }>("SELECT id, name FROM projects WHERE org_id = $1", [ctx.params.org!])).map((p) => [p.id, p.name]));
  const lines = rows.map((r) => ({ time_utc: new Date(r.timeMs).toISOString(), who: whoOf(r), who_email: r.actor.startsWith("user:") ? (r.who?.email ?? "") : "", action: r.action, about: aboutOf(r, projects), detail: r.detail }));
  const name = `wizelens-audit-${new Date(ctx.app.config.now()).toISOString().slice(0, 10)}.${format}`;
  const body =
    format === "json"
      ? JSON.stringify(lines)
      : ["time_utc,who,who_email,action,about,detail", ...lines.map((l) => [l.time_utc, l.who, l.who_email, l.action, l.about, JSON.stringify(l.detail)].map(csvCell).join(","))].join("\n");
  ctx.res.writeHead(200, { "Content-Type": format === "json" ? "application/json" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });
  ctx.res.end(body);
}
