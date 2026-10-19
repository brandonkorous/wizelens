import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newTraceId, type TagList } from "@wizeworks/lens-core";
import { createWizeLens } from "./index.js";
import { fakeSpan, getJson, type Running, startApp } from "./test/helpers.js";

const wizelens = createWizeLens({
  serviceName: "tags-api", enabled: true, storage: "memory", instrumentFetch: false, enableMcp: true, audit: () => {},
  tags: { rules: [{ name: "Slow", query: "duration:>100ms", color: "red" }, { name: "pay", query: "path:/api/pay" }], disableBuiltIns: ["bot"] },
});
let app: Running;
const now = Date.now();
const [stream, pay] = [newTraceId(), newTraceId()];
const base = () => `${app.base}/_wizelens/api`;

beforeAll(async () => {
  app = await startApp(wizelens, () => {});
  wizelens.store.addSpan({ ...fakeSpan(stream, now - 2000, { "url.path": "/mcp", "http.request.method": "GET", "http.response.header.content-type": "text/event-stream" }), durationMs: 5 });
  wizelens.store.addSpan({ ...fakeSpan(pay, now - 1000, { "url.path": "/api/pay", "http.request.method": "POST" }), durationMs: 300 });
});

afterAll(async () => {
  await wizelens.shutdown();
  await app.close();
});

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("in-app tags", () => {
  it("lists the built-ins and the rules from code, read-only", async () => {
    const list = await getJson<TagList>(`${base()}/tags`);
    expect(list.editable).toBe(false);
    expect(list.tags.map((t) => `${t.name}:${t.enabled}:${t.color}`)).toEqual(["stream:true:violet", "probe:true:slate", "bot:false:amber", "pay:true:blue", "slow:true:red"]);
  });

  it("says which rules match a page of rows", async () => {
    const items = [stream, pay].map((traceId, i) => ({ traceId, owner: "", timeMs: now - 2000 + i * 1000 }));
    const res = await post(`${base()}/tags/match`, { kind: "requests", items });
    expect(await res.json()).toEqual({ matches: { [`${stream} `]: ["stream"], [`${pay} `]: ["pay", "slow"] } });
    expect((await post(`${base()}/tags/match`, { kind: "nope", items })).status).toBe(400);
  });

  it("searches with tag: and says which names no rule has", async () => {
    const page = await getJson<{ items: { traceId: string }[]; unknownTags: string[] }>(`${base()}/search?range=1h&q=${encodeURIComponent("tag:slow OR tag:stream OR tag:typo")}`);
    expect(page.items.map((i) => i.traceId)).toEqual([pay, stream]);
    expect(page.unknownTags).toEqual(["typo"]);
    const suggest = await getJson<{ items: { value: string }[] }>(`${base()}/search/suggest?field=tag&prefix=s`);
    expect(suggest.items.map((s) => s.value)).toEqual(["stream", "slow"]);
  });

  it("refuses a bad rule at startup", () => {
    expect(() => createWizeLens({ serviceName: "x", enabled: true, storage: "memory", tags: { rules: [{ name: "x", query: "status:abc" }] } })).toThrow(/status/);
    expect(() => createWizeLens({ serviceName: "x", enabled: true, storage: "memory", tags: { disableBuiltIns: ["nope"] } })).toThrow(/nope/);
  });

  it("gives AI tools list_tags, tag: in search, and the tags on each result", async () => {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    const call = async (name: string, args: object) => {
      const res = await fetch(`${app.base}/_wizelens/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
      return JSON.parse(((await res.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text) as Record<string, unknown>;
    };
    expect(((await call("list_tags", {})) as unknown as { name: string }[]).map((t) => t.name)).toEqual(["stream", "probe", "bot", "pay", "slow"]);
    const found = (await call("search", { q: "tag:pay", range: "1h" })) as { items: { traceId: string }[]; tags: Record<string, string[]> };
    expect(found.items.map((i) => i.traceId)).toEqual([pay]);
    expect(found.tags).toEqual({ [`${pay} `]: ["pay", "slow"] });
    expect(((await call("list_traces", { q: "tag:stream", range: "1h" })) as unknown as { traceId: string }[]).map((t) => t.traceId)).toEqual([stream]);
  });
});
