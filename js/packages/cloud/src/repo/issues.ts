// Issue states per project: error groups and insights a person resolved, ignored, or assigned.
import type { IssueKind, IssueState } from "@wizeworks/lens-core";
import type { Queryable } from "../db/db.js";

interface Row {
  kind: string;
  key: string;
  status: string;
  until_ms: number | null;
  resolved_ms: number | null;
  assignee: string | null;
  updated_ms: number;
}

const stateOf = (r: Row): IssueState => ({
  kind: r.kind as IssueKind,
  key: r.key,
  status: r.status as IssueState["status"],
  untilMs: r.until_ms === null ? null : Number(r.until_ms),
  resolvedMs: r.resolved_ms === null ? null : Number(r.resolved_ms),
  assignee: r.assignee,
  updatedMs: Number(r.updated_ms),
});

/** Every issue state of a project. */
export async function listIssues(q: Queryable, projectId: string): Promise<IssueState[]> {
  const rows = await q.query<Row>("SELECT kind, key, status, until_ms, resolved_ms, assignee, updated_ms FROM issues WHERE project_id = $1", [projectId]);
  return rows.map(stateOf);
}

/** One issue's state, or undefined. */
export async function issueOf(q: Queryable, projectId: string, kind: IssueKind, key: string): Promise<IssueState | undefined> {
  const [row] = await q.query<Row>("SELECT kind, key, status, until_ms, resolved_ms, assignee, updated_ms FROM issues WHERE project_id = $1 AND kind = $2 AND key = $3", [projectId, kind, key]);
  return row ? stateOf(row) : undefined;
}

/** Keep a state, or remove it (null: back to plain unresolved). */
export async function saveIssue(q: Queryable, projectId: string, kind: IssueKind, key: string, state: IssueState | null, actor: string): Promise<void> {
  if (!state) return void (await q.query("DELETE FROM issues WHERE project_id = $1 AND kind = $2 AND key = $3", [projectId, kind, key]));
  await q.query(
    `INSERT INTO issues (project_id, kind, key, status, until_ms, resolved_ms, assignee, updated_ms, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (project_id, kind, key) DO UPDATE SET status = $4, until_ms = $5, resolved_ms = $6, assignee = $7, updated_ms = $8, updated_by = $9`,
    [projectId, kind, key, state.status, state.untilMs, state.resolvedMs, state.assignee, state.updatedMs, actor],
  );
}

/** Members of an organization a person can assign issues to. */
export async function assignableMembers(q: Queryable, orgId: string): Promise<{ id: string; name: string; email: string }[]> {
  return q.query<{ id: string; name: string; email: string }>("SELECT u.id, u.name, u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 ORDER BY u.name, u.email", [orgId]);
}
