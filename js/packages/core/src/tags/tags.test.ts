import { describe, expect, it } from "vitest";
import { requestDoc } from "../search/docs.js";
import { formatSearch } from "../search/format.js";
import { parseSearch } from "../search/parse.js";
import { compileSearch } from "../search/match.js";
import { searchMemory } from "../search/run.js";
import { requestItemOf } from "../scale/facts-lists.js";
import { requestOf } from "../stats/requests.js";
import { makeRequest } from "../testing/fixtures.js";
import { activeTags, BUILT_IN_TAGS, tagList } from "./builtins.js";
import { checkTagInput } from "./check.js";
import { expandTags } from "./expand.js";
import { endpointDoc, errorGroupDoc, groupTags, serviceDoc } from "./groups.js";
import { matchKey, matchTags, tagMatchRequestOf } from "./match.js";
import { endpointScope, errorScope, serviceScope, stableText, tagNameOf, userScope } from "./suggest.js";
import type { TagRule } from "./types.js";

const rule = (name: string, query: string, enabled = true): TagRule => ({ id: name, name, color: "blue", query, builtIn: false, enabled });
const own = [rule("slow", "duration:>100ms"), rule("pay", "path:/api/pay"), rule("off", "service:api", false)];
const tags = activeTags(tagList(own, new Set(["bot"])));
const expanded = (q: string) => formatSearch(expandTags(parseSearch(q), tags).node);

const stream = makeRequest({ path: "/mcp", attributes: { "http.response.header.content-type": "text/event-stream", "wizelens.tag.cache": "hit" } });
const pay = makeRequest({ path: "/api/pay", route: "/api/pay", method: "POST", status: 502, serverMs: 300, error: { type: "TimeoutError", message: "bank 42 did not answer" } });
const probe = makeRequest({ path: "/health", attributes: { "user_agent.original": "kube-probe/1.35" } });
const traces = [stream, pay, probe];
const window = { from: 0, to: Number.MAX_SAFE_INTEGER };

describe("tag rules", () => {
  it("checks names, colors, and searches", () => {
    expect(checkTagInput({ name: " Checkout ", color: "green", query: "route:/checkout*" }, [])).toEqual({ ok: true, input: { name: "checkout", color: "green", query: "route:/checkout*" } });
    expect(checkTagInput({ name: "slow", query: "duration:>1s" }, ["slow"])).toMatchObject({ ok: false, field: "name" });
    expect(checkTagInput({ name: "stream", query: "a" }, [])).toMatchObject({ ok: false, field: "name" });
    expect(checkTagInput({ name: "-x", query: "a" }, [])).toMatchObject({ ok: false, field: "name" });
    expect(checkTagInput({ name: "x", color: "pink", query: "a" }, [])).toMatchObject({ ok: false, field: "color" });
    expect(checkTagInput({ name: "x", query: "status:abc" }, [])).toMatchObject({ ok: false, field: "query" });
    expect(checkTagInput({ name: "x", query: "*" }, [])).toMatchObject({ ok: false, field: "query" });
    expect(checkTagInput({ name: "x", query: "-tag:slow" }, [])).toMatchObject({ ok: false, field: "query" });
    expect(checkTagInput({ name: "x", query: "a" }, [])).toMatchObject({ ok: true, input: { color: "blue" } });
  });

  it("lists built-ins first, then rules by name, and runs only the enabled ones", () => {
    expect(tagList(own, new Set(["bot"])).map((t) => `${t.name}:${t.enabled}`)).toEqual(["stream:true", "probe:true", "bot:false", "off:false", "pay:true", "slow:true"]);
    expect(tags.map((t) => t.name)).toEqual(["stream", "probe", "pay", "slow"]);
    expect(BUILT_IN_TAGS.every((t) => parseSearch(t.query))).toBe(true);
  });

  it("expands tag: to rules and to tags the app sets", () => {
    expect(expanded("tag:slow")).toBe("duration:>100ms OR @wizelens.tag.slow:*");
    expect(expanded("tag:cache")).toBe("@wizelens.tag.cache:*");
    expect(expanded("tag:cache:hit")).toBe("@wizelens.tag.cache:hit");
    expect(expanded("tag:s* -tag:pay")).toBe("(@http.response.header.content-type:text/event-stream* OR duration:>100ms) NOT (path:/api/pay OR @wizelens.tag.pay:*)");
    expect(expanded("tag:off")).toBe("@wizelens.tag.off:*");
    expect(expanded("tag:zz*")).toBe("NOT *");
    expect(expandTags(parseSearch("tag:nope OR tag:Slow"), tags).unknownTags).toEqual(["nope"]);
  });

});

describe("tag search and matching", () => {
  it("finds what a tag stands for in a search", () => {
    const found = (q: string) => searchMemory(traces, { kind: "requests", node: expandTags(parseSearch(q), tags).node, window, limit: 50 }).items.map((r) => r.path);
    expect(found("tag:stream")).toEqual(["/mcp"]);
    expect(found("tag:probe")).toEqual(["/health"]);
    expect(found("tag:slow")).toEqual(["/api/pay"]);
    expect(found("tag:cache:hit")).toEqual(["/mcp"]);
    expect(found("-tag:stream -tag:probe")).toEqual(["/api/pay"]);
  });

  it("matches a page of rows, and only the rows asked for", async () => {
    const run = (q: Parameters<typeof searchMemory>[1]) => searchMemory(traces, q);
    const items = [stream, pay].map((t) => ({ traceId: t.traceId, owner: "", timeMs: requestItemOf(requestOf(t)!).startMs }));
    expect(await matchTags(run, "requests", items, tags)).toEqual({ [matchKey(stream.traceId, "")]: ["stream"], [matchKey(pay.traceId, "")]: ["pay", "slow"] });
    const server = pay.spans.find((s) => s.category === "http.server")!;
    expect(await matchTags(run, "spans", [{ traceId: pay.traceId, owner: server.spanId, timeMs: server.startMs }], tags)).toEqual({ [matchKey(pay.traceId, server.spanId)]: ["pay", "slow"] });
    expect(await matchTags(run, "requests", items, [])).toEqual({});
  });

  it("reads match requests", () => {
    expect(tagMatchRequestOf({ kind: "requests", items: [{ traceId: "AB", timeMs: 1 }] })).toEqual({ ok: true, kind: "requests", items: [{ traceId: "ab", owner: "", timeMs: 1 }] });
    expect(tagMatchRequestOf({ kind: "nope", items: [] }).ok).toBe(false);
    expect(tagMatchRequestOf({ kind: "logs", items: [{ traceId: "x;", timeMs: 1 }] }).ok).toBe(false);
    expect(tagMatchRequestOf({ kind: "logs", items: Array.from({ length: 201 }, () => ({ traceId: "a", timeMs: 1 })) }).ok).toBe(false);
  });
});

describe("tags on group rows", () => {
  const groupTagsOf = (rules: TagRule[], ...args: Parameters<typeof groupTags> extends [unknown, ...infer R] ? R : never) => groupTags(activeTags(rules), ...args);

  it("shows a rule only when every field it names describes the row", () => {
    const rules = [rule("orders", "service:api route:/api/orders/*"), rule("slow", "service:api duration:>1s"), rule("posts", "method:POST"), rule("api", "service:api")];
    expect(groupTagsOf(rules, "endpoints", endpointDoc("api", "GET /api/orders/{id}"))).toEqual(["orders", "api"]);
    expect(groupTagsOf(rules, "endpoints", endpointDoc("api", "POST /api/cart"))).toEqual(["posts", "api"]);
    expect(groupTagsOf(rules, "services", serviceDoc("api"))).toEqual(["api"]);
    const timeout = rule("bank", 'service:api error:true "did not answer"');
    expect(groupTagsOf([timeout, rules[0]!], "errors", errorGroupDoc({ service: "api", type: "TimeoutError", message: "bank 42 did not answer" }))).toEqual(["bank"]);
    expect(groupTagsOf([rule("web", "service:browser")], "services", serviceDoc("Web App"))).toEqual(["web"]);
  });
});

describe("tag this", () => {
  const doc = requestDoc(requestItemOf(requestOf(pay)!), pay.spans.map((s) => s.attributes), undefined, ["bank 42 did not answer"]);
  const hits = (query: string) => compileSearch(parseSearch(query))(doc);

  it("makes searches that find the thing they came from", () => {
    expect(endpointScope("api", "POST /api/pay").query).toBe("service:api method:POST route:/api/pay");
    expect(hits(endpointScope("api", "POST /api/pay").query)).toBe(true);
    expect(hits(serviceScope("api").query)).toBe(true);
    expect(hits(errorScope({ service: "api", type: "TimeoutError", message: "bank 42 did not answer" }).query)).toBe(true);
    expect(hits(errorScope({ service: "api", type: "TimeoutError", message: "bank 7 did not answer" }).query)).toBe(true);
    expect(userScope("u 1").query).toBe('user:"u 1"');
    expect(serviceScope("Web App").query).toBe("service:browser");
  });

  it("names tags and keeps the part of a message that does not change", () => {
    expect(tagNameOf("GET /api/orders/{id}")).toBe("get-api-orders-id");
    expect(tagNameOf("!!!")).toBe("tag");
    expect(tagNameOf("x".repeat(50))).toHaveLength(40);
    expect(stableText("order 1234 for 5f0c1d2e3a4b5c6d7e8f not found")).toBe("not found");
    expect(stableText("Cannot read properties of undefined")).toBe("Cannot read properties of undefined");
  });
});
