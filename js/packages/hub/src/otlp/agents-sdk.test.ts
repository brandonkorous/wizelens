import type { InsightsModel } from "@wizeworks/lens-core";
import { afterEach, describe, expect, it } from "vitest";
import type { Hub } from "../hub.js";
import { findingsOf, forProtobuf, loadFixture, rebased, traceOf, tracesOf } from "../test/agents/load.js";
import { settleHub } from "../settle.js";
import { post, startHub } from "../test/helpers.js";
import { encodeTraces } from "./proto.js";

// Real exports from the samples with the WizeLens SDKs on: the Java extension, the Python package, and the Go module.
const fixture = loadFixture("agents-wizelens");
const traces = tracesOf(fixture);

describe("insights on agent spans with the WizeLens SDKs", () => {
  it.each(["orders-java", "orders-python", "inventory-go"])("finds the duplicate query in %s, because parameters are known", (service) => {
    expect(findingsOf(traceOf(traces, service, "GET /orders"))).toContain("duplicate-query SELECT name FROM customers WHERE id = ?");
  });

  it("folds the Java agent's db.query.parameter.N attributes into wizelens.db.parameters", () => {
    const q = traceOf(traces, "orders-java", "GET /orders").spans.find((s) => s.attributes["db.query.text"] === "SELECT COUNT(*) FROM items WHERE order_id = ?")!;
    expect(q.attributes["wizelens.db.parameters"]).toBe('["1"]');
    expect(Object.keys(q.attributes).filter((k) => k.startsWith("db.query.parameter."))).toEqual([]);
  });

  it.each(["orders-java", "orders-python", "inventory-go"])("keeps the request body of %s, with the password redacted", (service) => {
    const server = traceOf(traces, service, "POST /orders").spans.find((s) => s.kind === "server")!;
    expect(JSON.parse(String(server.attributes["wizelens.request.body"]))).toEqual({ customer: 1, sku: "KB-1", password: "[redacted]" });
  });

  it("names captured headers the way the add-ons do: Python's content_type and Java's lists become content-type and text", () => {
    for (const service of ["orders-java", "orders-python"]) {
      const server = traceOf(traces, service, "POST /orders").spans.find((s) => s.kind === "server")!;
      expect(server.attributes["http.request.header.content-type"]).toBe("application/json");
    }
  });
});

let hub: Hub;
afterEach(() => hub?.close());

describe("the hub's insights page on agent spans", () => {
  it.each(["json", "protobuf"])("groups the findings of all three languages (%s)", async (format) => {
    let url: string;
    ({ hub, url } = await startHub());
    const body = rebased(fixture);
    const res = format === "json"
      ? await post(`${url}/v1/traces`, { resourceSpans: body.resourceSpans })
      : await fetch(`${url}/v1/traces`, { method: "POST", headers: { "Content-Type": "application/x-protobuf" }, body: encodeTraces({ resourceSpans: forProtobuf(body.resourceSpans) }) });
    expect(res.status).toBe(200);
    settleHub(hub.data.store);
    const model = (await (await fetch(`${url}/_wizelens/api/models/insights?range=1h`)).json()) as InsightsModel;
    const kinds = new Set(model.groups.map((g) => g.kind));
    expect([...kinds].sort()).toEqual(["db-wait", "duplicate-query", "n+1-db", "n+1-http", "slow-query"]);
    const n1 = model.groups.find((g) => g.kind === "n+1-db" && g.shape === "SELECT COUNT(*) FROM items WHERE order_id = ?");
    expect(n1?.occurrences).toBe(3);
  });

  it("keeps the logs each agent sent with their trace", async () => {
    let url: string;
    ({ hub, url } = await startHub());
    const body = rebased(fixture);
    await post(`${url}/v1/traces`, { resourceSpans: body.resourceSpans });
    await post(`${url}/v1/logs`, { resourceLogs: body.resourceLogs });
    for (const service of ["orders-java", "orders-python", "inventory-go"]) {
      const id = traceOf(traces, service, "GET /fail").traceId;
      const t = (await (await fetch(`${url}/_wizelens/api/traces/${id}`)).json()) as { logs: { level: string; message: string }[] };
      expect(t.logs).toContainEqual(expect.objectContaining({ level: "error", message: "payment provider timed out" }));
    }
  });
});
