// Error groups and insights as issues: resolved, ignored (for a while or for good), regressed when a resolved one comes back, and assigned.

export type IssueKind = "error" | "insight";

/** What a person set. An issue with no state is unresolved. */
export interface IssueState {
  kind: IssueKind;
  key: string;
  /** "open" keeps an assignee on an unresolved issue. */
  status: "open" | "resolved" | "ignored";
  /** Ignored until this time; null for good. */
  untilMs: number | null;
  /** When it was resolved. */
  resolvedMs: number | null;
  /** The member it is assigned to (cloud user id), or null. */
  assignee: string | null;
  updatedMs: number;
}

/** What the dashboard shows. */
export type IssueStatus = "unresolved" | "resolved" | "ignored" | "regressed";

/** States by `issueId`, as hosts hand them to page models. */
export type IssueStates = Readonly<Record<string, IssueState>>;

export const issueId = (kind: IssueKind, key: string): string => `${kind}:${key}`;

/** States as page models take them, from a host's list. */
export const issueStatesOf = (list: readonly IssueState[]): IssueStates => Object.fromEntries(list.map((s) => [issueId(s.kind, s.key), s]));

/** Pages whose models read issue states; hosts load them only for these. */
export const ISSUE_PAGES: ReadonlySet<string> = new Set(["errors", "error", "insights", "overview"]);

/** The status of an issue last seen at `lastMs`: a resolved one that happened again is regressed; an ignore that ran out is unresolved. */
export function issueStatusOf(state: IssueState | undefined, lastMs: number, now: number): IssueStatus {
  if (!state || state.status === "open") return "unresolved";
  if (state.status === "ignored") return state.untilMs === null || state.untilMs > now ? "ignored" : "unresolved";
  return lastMs > (state.resolvedMs ?? 0) ? "regressed" : "resolved";
}

export type IssueAction = "resolve" | "ignore" | "reopen" | "assign";

export interface IssueChange {
  kind: IssueKind;
  key: string;
  action: IssueAction;
  /** For "ignore": until when; null or missing for good. */
  untilMs?: number | null;
  /** For "assign": the member, or null to unassign. */
  assignee?: string | null;
}

const ACTIONS: readonly IssueAction[] = ["resolve", "ignore", "reopen", "assign"];

/** A change from a request body, or a message saying what is wrong. */
export function parseIssueChange(body: unknown): IssueChange | string {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.kind !== "error" && b.kind !== "insight") return "Set kind to error or insight.";
  if (typeof b.key !== "string" || !b.key || b.key.length > 2000) return "Set key to the issue's key.";
  if (!ACTIONS.includes(b.action as IssueAction)) return "Set action to resolve, ignore, reopen, or assign.";
  const until = b.untilMs === null || b.untilMs === undefined ? null : Number(b.untilMs);
  if (until !== null && !Number.isFinite(until)) return "Set untilMs to a time, or leave it out to ignore for good.";
  const assignee = typeof b.assignee === "string" && b.assignee ? b.assignee.slice(0, 200) : null;
  return { kind: b.kind, key: b.key, action: b.action as IssueAction, untilMs: until, assignee };
}

/** The state after a change; null when nothing is left to keep (reopened and not assigned). */
export function applyIssueChange(prev: IssueState | undefined, c: IssueChange, now: number): IssueState | null {
  const base = { kind: c.kind, key: c.key, assignee: prev?.assignee ?? null, updatedMs: now };
  if (c.action === "resolve") return { ...base, status: "resolved", untilMs: null, resolvedMs: now };
  if (c.action === "ignore") return { ...base, status: "ignored", untilMs: c.untilMs ?? null, resolvedMs: null };
  if (c.action === "assign") {
    const next: IssueState = prev ? { ...prev, assignee: c.assignee ?? null, updatedMs: now } : { ...base, status: "open", untilMs: null, resolvedMs: null, assignee: c.assignee ?? null };
    return next.status === "open" && !next.assignee ? null : next;
  }
  return prev?.assignee ? { ...base, status: "open", untilMs: null, resolvedMs: null } : null;
}
