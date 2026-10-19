import { afterEach, describe, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { post, startHub } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

describe("hub issues", () => {
  it("resolves, ignores, and reopens an error group, and says it keeps issues", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    const base = `${url}/_wizelens/api/issues?project=shop`;
    expect((await (await fetch(`${url}/_wizelens/api/info`)).json()).capabilities).toContain("issues");
    expect((await post(base, { kind: "error", key: "api|Error|boom", action: "resolve" })).status).toBe(200);
    expect((await post(base, { kind: "insight", key: "n+1|q", action: "ignore", untilMs: 99 })).status).toBe(200);
    const list = (await (await fetch(base)).json()) as { issues: { kind: string; status: string; untilMs: number | null }[] };
    expect(list.issues.map((s) => [s.kind, s.status, s.untilMs]).sort()).toEqual([["error", "resolved", null], ["insight", "ignored", 99]]);
    expect((await post(base, { kind: "error", key: "api|Error|boom", action: "reopen" })).status).toBe(200);
    expect(((await (await fetch(base)).json()) as { issues: unknown[] }).issues).toHaveLength(1);
    expect((await (await fetch(`${url}/_wizelens/api/issues?project=other`)).json())).toEqual({ issues: [], members: [] });
  });

  it("refuses a bad change and assigning (the hub has no members)", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    const base = `${url}/_wizelens/api/issues?project=`;
    expect((await post(base, { kind: "bug", key: "k", action: "resolve" })).status).toBe(400);
    expect((await post(base, { kind: "error", key: "k", action: "assign", assignee: "u" })).status).toBe(400);
  });
});
