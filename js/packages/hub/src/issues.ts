// Issue states on the hub: error groups and insights resolved or ignored, per project ("" for all).
import type { DatabaseSync } from "node:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { applyIssueChange, type IssueKind, type IssueState, issueStatesOf, type IssueStates, parseIssueChanges } from "@wizeworks/lens-core";
import { sendJson } from "@wizeworks/lens-node/kit";
import { parseJson, readBody } from "./body.js";

interface Row {
  kind: string;
  key: string;
  status: string;
  until_ms: number | null;
  resolved_ms: number | null;
  assignee: string | null;
  updated_ms: number;
}

/** Bumps on every change, so cached page models that read states are not reused. */
let version = 0;
export const issuesVersion = (): number => version;

const stateOf = (r: Row): IssueState => ({ kind: r.kind as IssueKind, key: r.key, status: r.status as IssueState["status"], untilMs: r.until_ms, resolvedMs: r.resolved_ms, assignee: r.assignee, updatedMs: r.updated_ms });

export function listIssues(db: DatabaseSync, project: string): IssueState[] {
  return (db.prepare("SELECT kind, key, status, until_ms, resolved_ms, assignee, updated_ms FROM issues WHERE project = ?").all(project) as unknown as Row[]).map(stateOf);
}

/** States as page models take them. */
export const issueStates = (db: DatabaseSync, project: string): IssueStates => issueStatesOf(listIssues(db, project));

function save(db: DatabaseSync, project: string, kind: IssueKind, key: string, s: IssueState | null): void {
  if (!s) return void db.prepare("DELETE FROM issues WHERE project = ? AND kind = ? AND key = ?").run(project, kind, key);
  db.prepare(
    `INSERT INTO issues (project, kind, key, status, until_ms, resolved_ms, assignee, updated_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (project, kind, key) DO UPDATE SET status = excluded.status, until_ms = excluded.until_ms, resolved_ms = excluded.resolved_ms, assignee = excluded.assignee, updated_ms = excluded.updated_ms`,
  ).run(project, kind, key, s.status, s.untilMs, s.resolvedMs, s.assignee, s.updatedMs);
}

/** `GET api/issues?project=`: the project's states. `POST api/issues?project=`: resolve, ignore, or reopen one issue, or many with `keys` (the hub has no members to assign to). */
export async function handleIssues(db: DatabaseSync, method: string, project: string, req: IncomingMessage, res: ServerResponse, now: number): Promise<void> {
  if (method === "GET") return sendJson(res, 200, { issues: listIssues(db, project), members: [] });
  const cs = parseIssueChanges(parseJson(await readBody(req)));
  if (typeof cs === "string") return sendJson(res, 400, { error: cs });
  if (cs[0]!.action === "assign") return sendJson(res, 400, { error: "The hub has no members to assign to." });
  const known = listIssues(db, project);
  const issues = cs.map((c) => {
    const next = applyIssueChange(known.find((s) => s.kind === c.kind && s.key === c.key), c, now);
    save(db, project, c.kind, c.key, next);
    return next;
  });
  version++;
  sendJson(res, 200, { issue: issues[0] ?? null, issues });
}
