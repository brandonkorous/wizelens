import { describe, expect, it } from "vitest";
import { endpointName, spanEndpointName } from "./endpoint.js";
import { endpointNameOf } from "./models/service-detail.js";
import { requestRows } from "./stats/requests.js";
import { makeRequest, makeSpan } from "./testing/fixtures.js";

const ID = "6c4904ff-1b2c-4d5e-8f90-123456789abc";

describe("endpoint names", () => {
  it("uses the route, else the path's shape without the query", () => {
    expect(endpointName("GET", "/orders/{id}", "/orders/7?x=1")).toBe("GET /orders/{id}");
    expect(endpointName("GET", null, `/api/live/${ID}?a=1&b=2`)).toBe("GET /api/live/{}");
  });

  it("names a route-less server span by its shaped path, not its raw name", () => {
    const s = makeSpan({ category: "http.server", kind: "server", name: `GET /api/live/${ID}`, attributes: { "http.request.method": "GET", "url.path": `/api/live/${ID}` } });
    expect(spanEndpointName(s)).toBe("GET /api/live/{}");
    expect(endpointNameOf(s, "api")).toBe("GET /api/live/{}");
    expect(spanEndpointName(makeSpan({ category: "messaging", kind: "server", name: "orders process" }))).toBe("orders process");
  });

  it("gives requests the same name as the service page, whatever the query", () => {
    const rows = requestRows([makeRequest({ path: "/search", attributes: { "url.query": "q=1&page=2" } }), makeRequest({ path: "/search", attributes: { "url.query": "sort=a" } })]);
    expect(new Set(rows.map((r) => r.endpoint))).toEqual(new Set(["GET /search"]));
  });
});
