import { afterEach, describe, expect, it } from "vitest";
import { analyzeTrace, type Span } from "@wizeworks/lens-core";
import { createWizeLens } from "../wizelens.js";
import { esOperation, esPathShape, instrumentElasticsearch } from "./elasticsearch.js";

const wizelens = createWizeLens({ serviceName: "elastic", storage: "memory", traceQueriesOutsideRequests: true });
const dbSpans = (): Span[] => wizelens.store.all().flatMap((t) => t.spans.filter((s) => s.category === "db")).sort((a, b) => a.startMs - b.startMs);
afterEach(() => wizelens.store.clear());

interface Params {
  method: string;
  path: string;
  body?: unknown;
  bulkBody?: unknown;
  meta?: { name: string };
}
type Callback = (err: Error | null, result?: unknown) => void;

function respond(p: Params): unknown {
  if (p.path.includes("missing")) throw new Error("index_not_found_exception");
  if (p.path.endsWith("/_search")) return { hits: { hits: [{ _id: "a" }, { _id: "b" }, { _id: "c" }] } };
  if (p.path.endsWith("/_bulk")) return { errors: true, items: [{ index: { status: 201 } }, { index: { status: 400 } }] };
  return { _id: "42", found: true, _source: { email: "ann@example.com" } };
}

// Shaped like @elastic/transport: request(params, options) returns the body, or the full result with meta: true. v7 also took a callback.
class FakeTransport {
  connectionPool = { connections: [{ url: new URL("https://es.local:9243") }] };
  async request(params: Params, options?: { meta?: boolean } | Callback, cb?: Callback): Promise<unknown> {
    const done = typeof options === "function" ? options : cb;
    if (done) return void setTimeout(() => done(null, respond(params)), 1);
    const body = respond(params);
    return typeof options === "object" && options.meta ? { body, statusCode: 200, headers: {} } : body;
  }
}

describe("elasticsearch", () => {
  it("patches the module, the transport module, a client, or a transport", () => {
    expect(instrumentElasticsearch(wizelens, { Client: class {}, Transport: FakeTransport })).toBe(true);
    expect(instrumentElasticsearch(wizelens, { default: FakeTransport })).toBe(true);
    expect(instrumentElasticsearch(wizelens, { transport: new FakeTransport() })).toBe(true);
    expect(instrumentElasticsearch(wizelens, { Client: class {} })).toBe(false);
  });

  it("traces a search with its path shape, index, rows, and server, never the body", async () => {
    instrumentElasticsearch(wizelens, { Transport: FakeTransport });
    const query = { query: { match: { email: "bob@example.com" } } };
    await new FakeTransport().request({ method: "POST", path: "/orders/_search", body: query, meta: { name: "search" } });
    const [span] = dbSpans();
    expect(span!.name).toBe("search orders");
    expect(span!.attributes).toMatchObject({
      "db.system.name": "elasticsearch", "db.operation.name": "search", "db.query.text": "POST /orders/_search", "db.namespace": "orders",
      "db.collection.name": "orders", "db.response.returned_rows": 3, "server.address": "es.local", "server.port": 9243, "wizelens.db.adapter": "elasticsearch",
    });
    expect(JSON.stringify(span!.attributes)).not.toMatch(/bob@example|match/);
  });

  it("hides document ids, reads full results, and supports callbacks", async () => {
    instrumentElasticsearch(wizelens, { Transport: FakeTransport });
    const es = new FakeTransport();
    await es.request({ method: "GET", path: "/orders/_doc/42" }, { meta: true });
    await new Promise<void>((r) => es.request({ method: "DELETE", path: "/orders/_doc/43" }, () => r()));
    const [get, del] = dbSpans();
    expect(get!.attributes).toMatchObject({ "db.query.text": "GET /orders/_doc/?", "db.operation.name": "get" });
    expect(del!.attributes).toMatchObject({ "db.query.text": "DELETE /orders/_doc/?", "db.operation.name": "delete" });
  });
});

describe("elasticsearch errors and analysis", () => {
  it("marks failed requests and bulk calls with failed items", async () => {
    instrumentElasticsearch(wizelens, { Transport: FakeTransport });
    const es = new FakeTransport();
    await expect(es.request({ method: "GET", path: "/missing/_search" })).rejects.toThrow("index_not_found");
    const bulkBody = [{ index: { _index: "orders" } }, { email: "x@y.z" }, { index: { _index: "orders" } }, { email: "w@y.z" }];
    await es.request({ method: "POST", path: "/_bulk", bulkBody, meta: { name: "bulk" } });
    const [missing, bulk] = dbSpans();
    expect(missing!.status).toBe("error");
    expect(bulk!.status).toBe("error");
    expect(bulk!.attributes).toMatchObject({ "db.operation.name": "bulk", "db.operation.batch.size": 2 });
    expect(JSON.stringify(bulk!.attributes)).not.toMatch(/x@y\.z/);
  });

  it("finds N+1 and duplicate document reads in a request", async () => {
    instrumentElasticsearch(wizelens, { Transport: FakeTransport });
    const es = new FakeTransport();
    await wizelens.tracer.startActiveSpan("GET /feed", async (root) => {
      for (const id of [1, 2, 3, 4, 5]) await es.request({ method: "GET", path: `/posts/_doc/${id}` });
      await es.request({ method: "GET", path: "/posts/_doc/1" });
      root.end();
    });
    const trace = wizelens.store.all().find((t) => t.spans.some((s) => s.name === "GET /feed"))!;
    const findings = analyzeTrace(trace);
    expect(findings.find((f) => f.kind === "n+1-db")).toMatchObject({ shape: "GET /posts/_doc/?", count: 6 });
    expect(findings.find((f) => f.kind === "duplicate-query")?.count).toBe(2);
  });
});

describe("elasticsearch shapes", () => {
  it("normalize ids and dated index names and drop the query string", () => {
    expect(esPathShape("/logs-2024.10.19/_search?q=secret")).toBe("/logs-?.?.?/_search");
    expect(esPathShape("/_tasks/oTUltX4IQMOUUVeiohTt8A:12345")).toBe("/_tasks/?");
    expect(esPathShape("/orders/_mapping")).toBe("/orders/_mapping");
    expect(esPathShape("/orders/_update/a-b-c")).toBe("/orders/_update/?");
  });

  it("read the API from the method and path when the client gives no name", () => {
    expect(esOperation({ method: "PUT", path: "/orders/_doc/1" })).toBe("index");
    expect(esOperation({ method: "POST", path: "/orders/_update_by_query" })).toBe("update_by_query");
    expect(esOperation({ method: "PUT", path: "/orders" })).toBe("indices.create");
    expect(esOperation({ method: "GET", path: "/" })).toBe("info");
  });
});
