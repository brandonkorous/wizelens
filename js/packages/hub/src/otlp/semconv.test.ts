import { DEFAULT_REDACT_KEYS } from "@wizeworks/lens-core";
import { describe, expect, it } from "vitest";
import { foldDbParams, pythonToJson } from "./db-params.js";
import { hideNestedDb } from "./nested.js";
import { toSpan } from "./spans.js";

const ids = { traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331" };
const str = (key: string, value: string) => ({ key, value: { stringValue: value } });
const list = (key: string, ...values: string[]) => ({ key, value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } } });

describe("older semantic-convention names", () => {
  it("map the old HTTP server names and split http.target into path and query", () => {
    const s = toSpan({ ...ids, kind: 2, attributes: [str("http.method", "GET"), str("http.target", "/orders?page=2"), str("http.user_agent", "curl"), str("net.host.name", "api")] }, "py", []);
    expect(s?.category).toBe("http.server");
    expect(s?.attributes).toMatchObject({ "http.request.method": "GET", "url.path": "/orders", "url.query": "page=2", "user_agent.original": "curl", "server.address": "api" });
  });

  it("map the Java agent's db.sql.table to db.collection.name", () => {
    const s = toSpan({ ...ids, kind: 3, attributes: [str("db.system", "postgresql"), str("db.sql.table", "orders")] }, "java", []);
    expect(s?.attributes["db.collection.name"]).toBe("orders");
  });

  it("join header lists and use dashes in header names", () => {
    const s = toSpan({ ...ids, kind: 2, attributes: [list("http.request.header.accept", "a", "b"), str("http.request.header.content_type", "text/plain")] }, "py", []);
    expect(s?.attributes).toMatchObject({ "http.request.header.accept": "a, b", "http.request.header.content-type": "text/plain" });
  });
});

describe("SQL parameters from the agents", () => {
  it("fold db.query.parameter.N into a positional list", () => {
    const a = { "db.query.parameter.1": "pen", "db.query.parameter.0": "7", "db.query.text": "x" };
    foldDbParams(a, DEFAULT_REDACT_KEYS);
    expect(a).toEqual({ "db.query.text": "x", "wizelens.db.parameters": '["7","pen"]' });
  });

  it("fold named parameters and redact the sensitive ones", () => {
    const a: Record<string, string> = { "db.query.parameter.user": "ada", "db.query.parameter.password": "x" };
    foldDbParams(a, DEFAULT_REDACT_KEYS);
    expect(JSON.parse(a["wizelens.db.parameters"]!)).toEqual({ user: "ada", password: "[redacted]" });
  });

  it("read Python's db.statement.parameters text", () => {
    expect(pythonToJson("(7, 'it\\'s', None, True, 1.5)")).toEqual([7, "it's", null, true, 1.5]);
    expect(pythonToJson("{'token': 'abc', 'id': 3}")).toEqual({ token: "abc", id: 3 });
    expect(pythonToJson("(1,)")).toEqual([1]);
    expect(pythonToJson("(Decimal('1.5'),)")).toBeNull();
    const a: Record<string, string> = { "db.statement.parameters": "{'token': 'abc', 'id': 3}" };
    foldDbParams(a, DEFAULT_REDACT_KEYS);
    expect(JSON.parse(a["wizelens.db.parameters"]!)).toEqual({ token: "[redacted]", id: 3 });
  });

  it("keep text it cannot read, unless it names a secret", () => {
    const kept: Record<string, string> = { "db.statement.parameters": "(Decimal('1.5'),)" };
    foldDbParams(kept, DEFAULT_REDACT_KEYS);
    expect(kept["wizelens.db.parameters"]).toBe("(Decimal('1.5'),)");
    const hidden: Record<string, string> = { "db.statement.parameters": "(Secret('x'),)" };
    foldDbParams(hidden, DEFAULT_REDACT_KEYS);
    expect(hidden["wizelens.db.parameters"]).toBe("[redacted]");
  });

  it("leave parameters an SDK already set", () => {
    const a = { "wizelens.db.parameters": "[1]", "db.query.parameter.0": "2" };
    foldDbParams(a, DEFAULT_REDACT_KEYS);
    expect(a).toEqual({ "wizelens.db.parameters": "[1]" });
  });
});

describe("an ORM span over a driver span", () => {
  it("is one query: the driver span becomes internal and gives its parameters to the ORM span", () => {
    const db = (spanId: string, parentSpanId: string | undefined, params?: string) =>
      toSpan({ traceId: ids.traceId, spanId, parentSpanId, kind: 3, attributes: [str("db.system", "sqlite"), str("db.statement", "SELECT 1"), ...(params ? [str("wizelens.db.parameters", params)] : [])] }, "py", [])!;
    const [orm, driver] = hideNestedDb([db("1".repeat(16), undefined), db("2".repeat(16), "1".repeat(16), "[1]")]);
    expect(orm!.category).toBe("db");
    expect(orm!.attributes["wizelens.db.parameters"]).toBe("[1]");
    expect(driver!.category).toBe("internal");
  });
});
