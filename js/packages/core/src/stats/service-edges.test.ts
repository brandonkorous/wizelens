import { expect, it } from "vitest";
import { makeSpan } from "../testing/fixtures.js";
import { buildTrace } from "../trace.js";
import { serviceEdges } from "./services.js";

it("joins a cross-origin fetch to the API that answered it, with no traceparent (persona #069)", () => {
  // eShop's Blazor admin on :5001 saves through PublicApi on :5099; the server span has no parent.
  const fetch = makeSpan({ category: "browser", service: "browser", attributes: { "wizelens.browser.type": "fetch", "url.full": "https://localhost:5099/api/catalog-items" } });
  const api = makeSpan({ category: "http.server", service: "PublicApi", attributes: { "url.path": "/api/catalog-items" } });
  const edges = serviceEdges([buildTrace("t".repeat(32), [fetch, api], [], [])]);
  expect(edges.map((e) => `${e.from} → ${e.to}`)).toEqual(["Web App → PublicApi"]);
});
