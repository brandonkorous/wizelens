import { describe, expect, it } from "vitest";
import { applyIssueChange, issueId, type IssueState, issueStatusOf, parseIssueChange } from "./issues.js";
import { runPageSync } from "./models/index.js";
import { memoryExecutor } from "./scale/memory.js";
import { pageContext } from "./scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "./testing/scenario.js";

const ex = memoryExecutor(scenarioTraces());
const NOW = 1_000_000;

describe("issue states", () => {
  it("resolves, regresses when it happens again, and ignores for a while or for good", () => {
    const resolved = applyIssueChange(undefined, { kind: "error", key: "k", action: "resolve" }, NOW)!;
    expect(issueStatusOf(resolved, NOW - 1, NOW)).toBe("resolved");
    expect(issueStatusOf(resolved, NOW + 1, NOW + 2)).toBe("regressed");
    const until = applyIssueChange(resolved, { kind: "error", key: "k", action: "ignore", untilMs: NOW + 10 }, NOW)!;
    expect([issueStatusOf(until, NOW, NOW), issueStatusOf(until, NOW, NOW + 11)]).toEqual(["ignored", "unresolved"]);
    expect(issueStatusOf(applyIssueChange(undefined, { kind: "error", key: "k", action: "ignore" }, NOW)!, NOW, NOW * 9)).toBe("ignored");
  });

  it("keeps an assignee on an open issue, and forgets a reopened one without", () => {
    const assigned = applyIssueChange(undefined, { kind: "error", key: "k", action: "assign", assignee: "u1" }, NOW)!;
    expect(assigned).toMatchObject({ status: "open", assignee: "u1" });
    expect(issueStatusOf(assigned, NOW, NOW)).toBe("unresolved");
    expect(applyIssueChange(assigned, { kind: "error", key: "k", action: "reopen" }, NOW)).toMatchObject({ status: "open", assignee: "u1" });
    expect(applyIssueChange(undefined, { kind: "error", key: "k", action: "reopen" }, NOW)).toBeNull();
  });

  it("checks a change from a request", () => {
    expect(parseIssueChange({ kind: "error", key: "k", action: "ignore", untilMs: 5 })).toMatchObject({ untilMs: 5 });
    expect(parseIssueChange({ kind: "bug", key: "k", action: "resolve" })).toMatch(/kind/);
    expect(parseIssueChange({ kind: "error", key: "k", action: "delete" })).toMatch(/action/);
  });
});

describe("pages with issue states", () => {
  const ctxWith = (params: Record<string, string>, states: IssueState[]) => ({ ...pageContext("7d", SCENARIO_NOW, params), issues: Object.fromEntries(states.map((s) => [issueId(s.kind, s.key), s])) });
  const state = (key: string, status: IssueState["status"], resolvedMs: number | null): IssueState => ({ kind: "error", key, status, untilMs: null, resolvedMs, assignee: null, updatedMs: 0 });

  it("hides resolved and ignored groups from the unresolved list, and lists them under their status", () => {
    const all = runPageSync("errors", pageContext("7d", SCENARIO_NOW, { size: "200" }), ex).groups;
    const [a, b] = [all[0]!, all[1]!];
    const states = [state(a.key, "resolved", SCENARIO_NOW + 1), state(b.key, "ignored", null)];
    const open = runPageSync("errors", ctxWith({ size: "200" }, states), ex);
    expect(open.groups.map((g) => g.key)).not.toContain(a.key);
    expect(open.groups.map((g) => g.key)).not.toContain(b.key);
    expect(runPageSync("errors", ctxWith({ status: "resolved", size: "200" }, states), ex).groups.map((g) => g.key)).toEqual([a.key]);
    expect(runPageSync("errors", ctxWith({ status: "ignored", size: "200" }, states), ex).groups.map((g) => g.key)).toEqual([b.key]);
    expect(runPageSync("errors", ctxWith({ status: "all", size: "200" }, states), ex).groupCount).toBe(all.length);
  });

  it("shows a resolved group that came back as regressed, in the unresolved list", () => {
    const g = runPageSync("errors", pageContext("7d", SCENARIO_NOW, {}), ex).groups[0]!;
    const m = runPageSync("errors", ctxWith({ size: "200" }, [state(g.key, "resolved", g.lastSeenMs - 1)]), ex);
    expect(m.issues[g.key]?.status).toBe("regressed");
    expect(m.groups.map((x) => x.key)).toContain(g.key);
  });

  it("filters to groups first seen in the range", () => {
    const m = runPageSync("errors", pageContext("15m", SCENARIO_NOW, { new: "1", size: "200" }), ex);
    expect(m.groups.every((g) => m.issues[g.key]!.isNew && m.issues[g.key]!.firstSeenMs >= m.meta.window.from)).toBe(true);
  });
});
