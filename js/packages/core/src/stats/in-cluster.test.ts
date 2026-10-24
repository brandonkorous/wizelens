import { describe, expect, it } from "vitest";
import { makeSpan } from "../testing/fixtures.js";
import { buildTrace } from "../trace.js";
import { externalName, isClusterDependency, isInClusterHost } from "./in-cluster.js";
import { serviceRows } from "./services.js";

const call = (url: string) => {
  const server = makeSpan({ traceId: "f".repeat(32), category: "http.server", kind: "server", service: "agconn-web", name: "GET /", attributes: { "http.request.method": "GET", "url.path": "/" } });
  const client = makeSpan({ traceId: server.traceId, category: "http.client", kind: "client", service: "agconn-web", parentSpanId: server.spanId, attributes: { "http.request.method": "GET", "url.full": url } });
  return buildTrace(server.traceId, [server, client], [], []);
};

describe("in-cluster calls", () => {
  it("knows service names and cluster DNS names, not public hosts, localhost, or IPs", () => {
    expect(["api", "api:8080", "api-rest.sparx-prod.svc.cluster.local:3000", "db.default.svc"].map(isInClusterHost)).toEqual([true, true, true, true]);
    expect(["api.stripe.com", "localhost:3000", "10.0.0.4", "[::1]:80", ""].map(isInClusterHost)).toEqual([false, false, false, false, false]);
    expect(externalName("api-rest.sparx-prod.svc.cluster.local:3000")).toBe("api-rest (in-cluster)");
    expect(externalName("api.stripe.com")).toBe("api.stripe.com");
  });

  it("names an in-cluster call by its service, still as a call out of the app", () => {
    const rows = serviceRows([call("http://api/v1/landing"), call("https://api.stripe.com/v1/charges")]).filter((r) => r.kind === "external");
    expect(rows.map((r) => [r.key, r.name]).sort()).toEqual([["ext:api", "api (in-cluster)"], ["ext:api.stripe.com", "api.stripe.com"]]);
  });

  it("keeps in-cluster rows out of Problems, and outside services in", () => {
    expect(isClusterDependency({ kind: "external", detail: "api-rest.sparx-prod.svc.cluster.local:3000" })).toBe(true);
    expect(isClusterDependency({ kind: "external", detail: "api.stripe.com" })).toBe(false);
    expect(isClusterDependency({ kind: "api", detail: null })).toBe(false);
  });
});
