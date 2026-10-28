import { describe, expect, it } from "vitest";
import { type IssueState, issueStatesOf } from "../issues.js";
import { memoryExecutor } from "../scale/memory.js";
import type { Need } from "../scale/needs.js";
import { pageContext } from "../scale/run.js";
import { makeRequest } from "../testing/fixtures.js";
import { isPageName, PAGES, type PageName, runPageSync } from "./index.js";

const NOW = 1_700_000_100_000;
const traces = [
  ...Array.from({ length: 6 }, (_, i) =>
    makeRequest({ startMs: NOW - 60_000 * (i + 1), path: `/api/orders/${i}`, route: "/api/orders/{id}", queries: Array.from({ length: 6 }, () => ({ sql: "SELECT * FROM items WHERE id = @p0", ms: 3 })) }),
  ),
  makeRequest({ startMs: NOW - 30_000, path: "/api/pay", status: 500, error: { type: "TimeoutError", message: "bank did not answer" } }),
  makeRequest({ startMs: NOW - 26 * 60 * 60_000, path: "/api/old" }),
];
const ex = memoryExecutor(traces);
const run = <P extends PageName>(page: P, params: Record<string, string> = {}, settling: number | null = null) => runPageSync(page, pageContext("24h", NOW, params, { slowQueryMs: 100 }, settling), ex);

describe("page models", () => {
  it("every model runs and survives JSON, so a server can send it", () => {
    for (const page of Object.keys(PAGES) as PageName[]) {
      const model = run(page);
      expect(JSON.parse(JSON.stringify(model))).toEqual(model);
      expect(isPageName(page)).toBe(true);
    }
    expect(isPageName("toString")).toBe(false);
  });

  it("every need has an id that is unique within its page", () => {
    for (const page of Object.keys(PAGES) as PageName[]) {
      const needs: Need[] = PAGES[page].needs(pageContext("24h", NOW, { trace: "x", q: "a", service: "api" }));
      expect(new Set(needs.map((n) => `${n.type}:${n.id}`)).size).toBe(needs.length);
    }
  });

  it("splits the window from the one before it, and says how many traces still settle", () => {
    expect(run("overview").meta).toMatchObject({ compareLabel: "vs. previous day", hasPrev: true, sampled: null, settling: null });
    expect(run("overview", {}, 12).meta.settling).toBe(12);
    expect(run("overview").headlines.total.value).toBe(7);
  });

  it("filters, sorts, and pages requests from parameters", () => {
    const m = run("requests", { status: "5xx", trace: traces[6]!.traceId });
    expect(m.total).toBe(1);
    expect(m.rows[0]!.path).toBe("/api/pay");
    expect(m.rows[0]).not.toHaveProperty("findings");
    expect(m.selected?.traceId).toBe(traces[6]!.traceId);
    const paged = run("requests", { sort: "path", desc: "0", size: "5", page: "2" });
    expect(paged).toMatchObject({ total: 7, page: 2, pageSize: 5 });
    expect(paged.rows).toHaveLength(2);
    expect(run("requests", { status: "bogus", duration: "bogus" })).toMatchObject({ total: 7, filtered: false });
  });

  it("finds the N+1 and the error, and counts it for the sidebar", () => {
    expect(run("database").insights.some((g) => g.kind === "n+1-db")).toBe(true);
    const errors = run("errors");
    expect(errors.groups[0]).toMatchObject({ type: "TimeoutError", count: 1 });
    expect(errors.cards.exceptions).toBe(1);
    expect(run("badges")).toEqual({ errors: 1 });
    expect(run("badges", { service: "Web App" })).toEqual({ errors: 0 });
  });

  it("leaves resolved and ignored errors out of the sidebar count, until they come back", () => {
    const key = run("errors").groups[0]!.key;
    const badge = (state: Omit<IssueState, "kind" | "key" | "assignee">) => {
      const ctx = { ...pageContext("24h", NOW, {}, { slowQueryMs: 100 }), issues: issueStatesOf([{ kind: "error", key, assignee: null, ...state }]) };
      return runPageSync("badges", ctx, ex).errors;
    };
    expect(badge({ status: "resolved", untilMs: null, resolvedMs: NOW })).toBe(0);
    expect(badge({ status: "ignored", untilMs: null, resolvedMs: null })).toBe(0);
    expect(badge({ status: "resolved", untilMs: null, resolvedMs: NOW - 48 * 3_600_000 })).toBe(1);
  });


  it("selects a service and fills its detail", () => {
    const m = run("services", { service: "api" });
    expect(m.selected?.row.name).toBe("api");
    expect(m.selected?.endpoints.length).toBeGreaterThan(0);
  });
});

describe("error links", () => {
  it("opens a linked error group by key, and says when it is not in the range", () => {
    const key = run("errors").groups[0]!.key;
    expect(run("errors", { group: key }).selected?.key).toBe(key);
    expect(run("errors", { group: "nope" }).selected).toBeNull();
    expect(run("errors").selected).toBeNull();
  });
});
