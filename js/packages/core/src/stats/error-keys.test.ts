import { describe, expect, it } from "vitest";
import { issueId, type IssueState } from "../issues.js";
import { issueInfos, issueKeys } from "../models/error-issues.js";
import type { NeedResults, PageContext } from "../scale/needs.js";
import { makeRequest } from "../testing/fixtures.js";
import type { Trace } from "../types.js";
import { errorIssueState, legacyErrorKey } from "./error-keys.js";
import { errorEvents, errorGroups } from "./errors.js";

const failed = (path: string, status: number): Trace => {
  const t = makeRequest({ path, status });
  t.spans[0]!.statusMessage = `HTTP ${status}`;
  return t;
};

const resolved = (key: string): IssueState => ({ kind: "error", key, status: "resolved", untilMs: null, resolvedMs: 5000, assignee: "ann", updatedMs: 5000 });

describe("HTTP status error groups", () => {
  it("splits status failures by status and endpoint", () => {
    const groups = errorGroups(errorEvents([failed("/a", 503), failed("/a", 503), failed("/b", 503), failed("/c", 500)]));
    expect(groups.map((g) => g.key).sort()).toEqual(["api|HttpError|500|GET /c", "api|HttpError|503|GET /a", "api|HttpError|503|GET /b"]);
    expect(groups.find((g) => g.key.endsWith("GET /a"))?.count).toBe(2);
  });

  it("keeps exceptions grouped by message shape", () => {
    const t = makeRequest({ path: "/x", status: 500, error: { type: "TypeError", message: "boom 7" } });
    expect(errorEvents([t])[0]?.key).toBe("api|TypeError|boom #");
  });

  it("finds a split group's state under its old shared key", () => {
    const key = "api|HttpError|503|GET /a";
    expect(legacyErrorKey(key)).toBe("api|HttpError|HTTP #");
    expect(legacyErrorKey("api|TypeError|boom #")).toBeNull();
    const old = resolved("api|HttpError|HTTP #");
    expect(errorIssueState({ [issueId("error", old.key)]: old }, key)).toBe(old);
    const own = { ...resolved(key), status: "ignored" as const };
    expect(errorIssueState({ [issueId("error", old.key)]: old, [issueId("error", key)]: own }, key)).toBe(own);
  });

  it("carries an old state over in lists and filters", () => {
    const key = "api|HttpError|503|GET /a";
    const issues = { [issueId("error", "api|HttpError|HTTP #")]: resolved("api|HttpError|HTTP #") };
    const agg = { firstMs: 1000, lastMs: 4000 } as NeedResults["groups"][string]["rows"][number]["agg"];
    const d: NeedResults = { groups: { life: { rows: [{ key, agg }], total: 1 } }, series: {}, lists: {}, traces: {} };
    const ctx = { issues, now: 9000, window: { from: 0, to: 9000 } } as unknown as PageContext;
    expect(issueInfos({ ...d, ...ctx }, [key])[key]).toMatchObject({ status: "resolved", assignee: "ann" });
    expect(issueKeys(ctx, d, "unresolved", null).exclude).toContain(key);
  });
});
