import { describe, expect, it } from "vitest";
import { MAX_BULK } from "./bulk.js";
import { parseIssueChanges } from "./issues.js";

describe("parseIssueChanges", () => {
  it("takes one key or many, without repeats", () => {
    expect(parseIssueChanges({ kind: "error", key: "a", action: "resolve" })).toEqual([{ kind: "error", key: "a", action: "resolve", untilMs: null, assignee: null }]);
    const many = parseIssueChanges({ kind: "insight", keys: ["a", "b", "a"], action: "ignore", untilMs: 5 });
    expect(Array.isArray(many) && many.map((c) => [c.key, c.untilMs])).toEqual([["a", 5], ["b", 5]]);
  });

  it("refuses an empty, too long, or bad list", () => {
    expect(parseIssueChanges({ kind: "error", keys: [], action: "resolve" })).toMatch(/1 to/);
    expect(parseIssueChanges({ kind: "error", keys: Array.from({ length: MAX_BULK + 1 }, (_, i) => `k${i}`), action: "resolve" })).toMatch(/1 to/);
    expect(parseIssueChanges({ kind: "error", keys: ["a", 7], action: "resolve" })).toMatch(/key/);
  });
});
