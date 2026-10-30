import { causeText } from "@wizeworks/lens-core/internal";
import type { CloudApp } from "../app.js";
import type { AlertRule } from "../repo/alerts.js";
import { projectPage } from "../routes/models.js";
import type { NoticeProblem } from "@wizeworks/lens-hub/internal";

/** Notices look for problems in the last 24 hours, and their links open that range, so the id matches. */
const PROBLEM_RANGE = "24h";

/** The dashboard link to one problem: its id in the range it was found in, plus the time and service that find it again later. */
export function problemUrl(base: string, projectId: string, p: { id: string; startMs: number; row: string | null }): string {
  const q = new URLSearchParams({ project: projectId, range: PROBLEM_RANGE, problem: p.id, at: String(Math.round(p.startMs)) });
  if (p.row) q.set("focus", p.row);
  return `${base}/_wizelens/#/problems?${q.toString()}`;
}

/** The problem near `now` (on `service`, when given) from the last 24 hours, or null. A failure never stops the notice. */
export async function problemFor(app: CloudApp, rule: AlertRule, now: number, service: string | null): Promise<NoticeProblem | null> {
  try {
    const [p] = await app.db.query<{ org_id: string }>("SELECT org_id FROM projects WHERE id = $1", [rule.projectId]);
    if (!p) return null;
    const params: Record<string, string> = { at: String(now), ...(service ? { focus: service } : {}) };
    const m = await projectPage(app, { id: rule.projectId, orgId: p.org_id }, "problems", PROBLEM_RANGE, params, rule.env || undefined);
    const found = m.selected;
    if (!found) return null;
    const row = found.anomalies[0]?.row ?? null;
    return { id: found.id, title: found.title, cause: found.cause ? causeText(found.cause) : null, url: problemUrl(app.baseUrl(), rule.projectId, { id: found.id, startMs: found.startMs, row }) };
  } catch (err) {
    console.error(`[wizelens-cloud] problem for alert ${rule.id} failed:`, err);
    return null;
  }
}
