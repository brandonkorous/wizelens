// Error groups as issues: their state (from the host), first seen over all time, and the keys a status or "new" filter keeps.
import { type IssueStates, type IssueStatus, issueStatusOf } from "../issues.js";
import { errorIssueState, legacyErrorKey } from "../stats/error-keys.js";
import type { GroupNeed, NeedResults, PageContext } from "../scale/needs.js";
import { groupNeed, rowsOf } from "./read.js";
import { type Bounds, inBounds } from "./release-rows.js";

export type IssueFilter = "unresolved" | "resolved" | "ignored" | "all";
export const isIssueFilter = (v: string | undefined): v is IssueFilter => v === "unresolved" || v === "resolved" || v === "ignored" || v === "all";

/** What a page shows about one error group as an issue. */
export interface IssueInfo {
  status: IssueStatus;
  /** First seen over everything the host keeps, not only this range. */
  firstSeenMs: number;
  /** First seen in this range. */
  isNew: boolean;
  assignee: string | null;
}

/** Every error group's first and last time over all kept data (by the service prefix when one is set). */
export const lifeNeed = (service: string): GroupNeed => groupNeed("life", "err.g", "all", service ? { filter: { prefix: `${service}|` } } : {});

type Life = Map<string, { firstMs: number; lastMs: number }>;
const lifeOf = (d: NeedResults): Life => new Map(rowsOf(d, "life").map((r) => [r.key, { firstMs: r.agg.firstMs, lastMs: r.agg.lastMs }]));

const statusOf = (issues: IssueStates, life: Life, key: string, now: number) => issueStatusOf(errorIssueState(issues, key), life.get(key)?.lastMs ?? 0, now);

/** Keys with a state of their own, plus groups split from an old key that has one. */
function statedKeys(issues: IssueStates, life: Life): string[] {
  const own = new Set(Object.values(issues).filter((s) => s.kind === "error").map((s) => s.key));
  const split = [...life.keys()].filter((k) => !own.has(k) && own.has(legacyErrorKey(k) ?? ""));
  return [...own, ...split];
}

/** The keys the list keeps (`keys`) or leaves out (`exclude`) for a status filter and first-seen bounds, within `only` when given. */
export function issueKeys(ctx: PageContext, first: NeedResults, status: IssueFilter, bounds: Bounds | null, only?: readonly string[]): { keys?: string[]; exclude?: string[] } {
  const issues = ctx.issues ?? {};
  const life = lifeOf(first);
  const stated = statedKeys(issues, life);
  const has = (key: string, want: IssueStatus[]) => want.includes(statusOf(issues, life, key, ctx.now));
  let keys: string[] | undefined = only ? [...only] : undefined;
  if (status === "resolved" || status === "ignored") keys = (keys ?? stated).filter((k) => has(k, [status]));
  if (bounds) keys = (keys ?? [...life.keys()]).filter((k) => inBounds(bounds, life.get(k)?.firstMs ?? 0));
  const exclude = status === "unresolved" ? stated.filter((k) => has(k, ["resolved", "ignored"])) : [];
  return { ...(keys ? { keys } : {}), ...(exclude.length ? { exclude } : {}) };
}

/** Issue info for the given groups. */
export function issueInfos(d: NeedResults & Pick<PageContext, "issues" | "now" | "window">, keys: readonly string[]): Record<string, IssueInfo> {
  const issues = d.issues ?? {};
  const life = lifeOf(d);
  return Object.fromEntries(
    keys.map((key) => {
      const l = life.get(key);
      const info: IssueInfo = { status: statusOf(issues, life, key, d.now), firstSeenMs: l?.firstMs ?? 0, isNew: (l?.firstMs ?? 0) >= d.window.from, assignee: errorIssueState(issues, key)?.assignee ?? null };
      return [key, info];
    }),
  );
}
