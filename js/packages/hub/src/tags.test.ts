import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TagList, TagRule } from "@wizeworks/lens-core/internal";
import { SCENARIO_NOW, scenarioTraces } from "../../core/src/testing/scenario.js";
import type { Hub } from "./hub.js";
import { post, startHub } from "./test/helpers.js";
import { RETENTION_MS, settleAll, writeTraces } from "./test/scale.js";

const clock = { now: SCENARIO_NOW };
let hub: Hub;
let url: string;
const api = (path: string) => `${url}/_wizelens/api/${path}`;
const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(api(path), { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const list = async () => (await (await fetch(api("tags"))).json()) as TagList;

beforeAll(async () => {
  ({ hub, url } = await startHub({ now: () => clock.now, maxAgeMs: RETENTION_MS }));
  writeTraces(hub.data.store, scenarioTraces());
  settleAll(hub.data.store, clock);
});
afterAll(() => hub.close());

describe("hub tags", () => {
  it("starts with the built-ins, editable", async () => {
    expect(await list()).toMatchObject({ editable: true, max: 50, tags: [{ name: "stream" }, { name: "probe" }, { name: "bot" }] });
  });

  it("adds, changes, and deletes rules, and checks them", async () => {
    const made = (await (await send("POST", "tags", { name: "slow", color: "red", query: "duration:>200ms" })).json()) as TagRule;
    expect(made).toMatchObject({ name: "slow", color: "red", builtIn: false, enabled: true });
    expect((await send("POST", "tags", { name: "slow", query: "x" })).status).toBe(400);
    expect(await (await send("POST", "tags", { name: "x", query: "status:abc" })).json()).toMatchObject({ ok: false, field: "query" });
    expect(await (await send("PATCH", `tags/${made.id}`, { query: "duration:>300ms" })).json()).toMatchObject({ name: "slow", color: "red", query: "duration:>300ms" });
    expect((await send("PATCH", "tags/nope", { query: "a" })).status).toBe(404);
    const other = (await (await send("POST", "tags", { name: "pay", query: "pay" })).json()) as TagRule;
    expect((await send("PATCH", `tags/${other.id}`, { name: "slow" })).status).toBe(400);
    expect((await send("DELETE", `tags/${other.id}`)).status).toBe(200);
    expect((await send("DELETE", `tags/${other.id}`)).status).toBe(404);
    expect((await list()).tags.map((t) => t.name)).toEqual(["stream", "probe", "bot", "slow"]);
  });

  it("turns built-ins off and on, and never edits them", async () => {
    expect(await (await send("PATCH", "tags/builtin:bot", { enabled: false })).json()).toMatchObject({ name: "bot", enabled: false });
    expect((await send("PATCH", "tags/builtin:bot", { query: "a" })).status).toBe(400);
    expect((await send("PATCH", "tags/builtin:nope", { enabled: false })).status).toBe(404);
    expect((await list()).tags.find((t) => t.name === "bot")?.enabled).toBe(false);
    await send("PATCH", "tags/builtin:bot", { enabled: true });
  });

  it("takes changes only from its own pages", async () => {
    expect((await send("POST", "tags", { name: "evil", query: "a" }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await send("POST", "tags", { name: "mine", query: "pay" }, { Origin: url })).status).toBe(201);
  });

  it("matches rows on SQLite and expands tag: in search", async () => {
    const page = (await (await fetch(api(`search?range=30d&limit=200&q=${encodeURIComponent("tag:slow OR tag:typo")}`))).json()) as { items: { traceId: string; startMs: number }[]; unknownTags: string[] };
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.unknownTags).toEqual(["typo"]);
    const items = page.items.map((i) => ({ traceId: i.traceId, owner: "", timeMs: i.startMs }));
    const { matches } = (await (await post(api("tags/match"), { kind: "requests", items })).json()) as { matches: Record<string, string[]> };
    expect(Object.keys(matches)).toHaveLength(items.length);
    expect(Object.values(matches).every((names) => names.includes("slow"))).toBe(true);
    expect((await post(api("tags/match"), { kind: "requests", items: "x" })).status).toBe(400);
    const suggest = (await (await fetch(api("search/suggest?field=tag&prefix="))).json()) as { items: { value: string }[] };
    expect(suggest.items.map((s) => s.value)).toEqual(["stream", "probe", "bot", "mine", "slow"]);
  });
});
