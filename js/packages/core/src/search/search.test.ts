import { describe, expect, it } from "vitest";
import { requestItemOf } from "../scale/facts-lists.js";
import { requestOf } from "../stats/requests.js";
import { logRows } from "../stats/logs.js";
import { makeRequest } from "../testing/fixtures.js";
import { SEARCH_LIMITS } from "./ast.js";
import { checkSearch } from "./check.js";
import { logDoc, requestDoc, spanDoc, traceDoc } from "./docs.js";
import { lex } from "./lex.js";
import { compileSearch } from "./match.js";
import { parseSearch } from "./parse.js";

const hit = (q: string) => compileSearch(parseSearch(q));

const pay = makeRequest({
  path: "/api/pay", route: "/api/pay", method: "POST", status: 502, attributes: { "enduser.id": "u-7", "tenant.id": 12 },
  error: { type: "TimeoutError", message: "bank did not answer" },
  queries: [{ sql: "SELECT * FROM cards WHERE id = @p0", ms: 40 }],
  logs: [{ timeMs: 1, level: "warn", category: "Payments", message: "retrying the bank", attributes: { attempt: 2 } }],
});

describe("search language", () => {
  it("marks quoted and escaped characters as literal", () => {
    const [t] = lex('a"*b"\\*');
    expect(t?.type === "term" && t.chars.map((c) => `${c.c}${c.lit ? "!" : ""}`).join("")).toBe("a*!b!*!");
  });

  it("enforces the size limits", () => {
    expect(checkSearch("a".repeat(SEARCH_LIMITS.chars + 1)).ok).toBe(false);
    expect(checkSearch(Array.from({ length: SEARCH_LIMITS.terms + 1 }, (_, i) => `w${i}`).join(" ")).ok).toBe(false);
    expect(checkSearch(`${"(".repeat(SEARCH_LIMITS.depth + 2)}a${")".repeat(SEARCH_LIMITS.depth + 2)}`).ok).toBe(false);
    expect(checkSearch(`${"(".repeat(SEARCH_LIMITS.depth - 1)}a${")".repeat(SEARCH_LIMITS.depth - 1)}`).ok).toBe(true);
  });

  it("finds spans by field, attribute, SQL text, and error message", () => {
    const docs = pay.spans.map((s) => spanDoc(s, "prod"));
    const count = (q: string) => docs.filter(hit(q)).length;
    expect(count("status:502 method:POST route:/api/pay user:u-7 env:prod")).toBe(1);
    expect(count("category:db cards")).toBe(1);
    expect(count('"bank did not answer"')).toBe(1);
    expect(count("@tenant.id:>=10")).toBe(1);
    expect(count("error:true")).toBe(1);
    expect(count("-error:true")).toBe(pay.spans.length - 1);
  });

  it("finds traces when any span matches an attribute", () => {
    const doc = traceDoc(pay);
    expect(hit("@db.system.name:sqlite @tenant.id:12 status:5xx path:/api/*")(doc)).toBe(true);
    expect(hit("@db.system.name:postgres")(doc)).toBe(false);
  });

  it("finds logs by level, category, and attribute", () => {
    const [row] = logRows([pay]);
    expect(hit("level:>=warn category:payments @attempt:2 retrying")(logDoc(row!))).toBe(true);
    expect(hit("level:error")(logDoc(row!))).toBe(false);
  });

  it("finds request rows, and their trace's attributes when given", () => {
    const item = requestItemOf(requestOf(pay)!);
    expect(hit("status:502 duration:>0 error:true route:/api/pay")(requestDoc(item))).toBe(true);
    expect(hit("@tenant.id:12")(requestDoc(item))).toBe(false);
    expect(hit("@tenant.id:12")(requestDoc(item, pay.spans.map((s) => s.attributes)))).toBe(true);
  });
});

describe("search paths", () => {
  it("reads the path of a full URL without its query", () => {
    const [server] = makeRequest({ path: "/api/items" }).spans;
    const doc = spanDoc({ ...server!, attributes: { "url.full": "https://shop.test/api/items?page=2" } });
    expect(hit("path:/api/items")(doc)).toBe(true);
    expect(hit("page=2")(doc)).toBe(true);
  });
});

describe("browser logs", () => {
  it("answer to service:browser and to their display name", () => {
    const t = makeRequest({ logs: [{ timeMs: 1, level: "info", category: "console", message: "clicked", attributes: {} }] });
    const [row] = logRows([{ ...t, logs: t.logs.map((l) => ({ ...l, service: "browser" })) }]);
    expect(row!.service).toBe("Web App");
    expect(hit("service:browser")(logDoc(row!))).toBe(true);
    expect(hit('service:"Web App"')(logDoc(row!))).toBe(true);
  });
});

describe("search inputs", () => {
  it("rejects prototype names as ranges", async () => {
    const { searchRequestOf } = await import("./request.js");
    expect(searchRequestOf(new URLSearchParams({ range: "constructor" }), 1_000_000, 86_400_000).ok).toBe(false);
  });

  it("suggests environments when memory documents have one", async () => {
    const { suggestMemory } = await import("./suggest.js");
    const t = makeRequest({ startMs: 1_000 });
    expect(suggestMemory([t], { field: "env", prefix: "", window: { from: 0, to: 10_000 }, limit: 5, env: "Development" })).toEqual([{ value: "Development", count: 1 }]);
  });
});
