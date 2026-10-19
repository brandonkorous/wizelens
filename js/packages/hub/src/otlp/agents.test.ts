import { describe, expect, it } from "vitest";
import { findingsOf, loadFixture, traceOf, tracesOf } from "../test/agents/load.js";

// Real exports from the samples by the plain agents: Java agent 2.32, opentelemetry-instrument 0.66, Go contrib.
const traces = tracesOf(loadFixture("agents-otel"));

describe("insights on plain agent spans", () => {
  it("finds N+1 queries and N+1 HTTP across Java, Python, and Go in one trace", () => {
    const t = traceOf(traces, "orders-java", "GET /orders");
    expect(t.services).toEqual(["inventory-go", "orders-java", "orders-python"]);
    expect(findingsOf(t)).toEqual([
      "n+1-db SELECT COUNT(*) FROM items WHERE order_id = ?",
      "n+1-db SELECT name FROM customers WHERE id = ?",
      "n+1-db SELECT quantity FROM stock WHERE sku = ?",
      "n+1-http GET localhost:6202/stock?sku={}",
      "n+1-http GET localhost:6203/stock?sku={}",
    ]);
  });

  it("does not call sanitized queries duplicates: their parameters are unknown", () => {
    for (const service of ["orders-java", "orders-python", "inventory-go"]) {
      expect(findingsOf(traceOf(traces, service, "GET /orders")).filter((f) => f.startsWith("duplicate"))).toEqual([]);
    }
  });

  it.each(["orders-java", "orders-python", "inventory-go"])("finds the slow query and the database wait in %s", (service) => {
    const found = findingsOf(traceOf(traces, service, "GET /report"));
    expect(found.filter((f) => f.startsWith("slow-query"))).toHaveLength(1);
    expect(found).toContain("db-wait 3");
  });

  it.each(["orders-java", "orders-python", "inventory-go"])("marks the failed request of %s as an error", (service) => {
    expect(traceOf(traces, service, "GET /fail").errorCount).toBeGreaterThan(0);
  });

  it("maps the old names each agent sends to the current ones", () => {
    const java = traceOf(traces, "orders-java", "GET /orders").spans.find((s) => s.category === "db" && s.service === "orders-java")!;
    expect(java.attributes).toMatchObject({ "db.system.name": "h2", "db.namespace": "orders", "db.collection.name": "orders", "db.operation.name": "SELECT" });
    const py = traceOf(traces, "orders-python", "GET /orders").spans;
    expect(py.find((s) => s.category === "http.client")!.attributes["url.full"]).toBe("http://localhost:6203/stock?sku=KB-1");
    const server = py.find((s) => s.kind === "server")!;
    expect(server.category).toBe("http.server");
    expect(server.attributes).toMatchObject({ "http.request.method": "GET", "url.path": "/orders", "http.response.status_code": 200 });
  });
});
