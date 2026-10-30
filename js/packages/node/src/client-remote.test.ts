import { afterAll, expect, it } from "vitest";
import { ATTR_BROWSER_REMOTE, newSpanId, newTraceId } from "@wizeworks/lens-core/internal";
import { type Running, startApp } from "./test/helpers.js";
import { trustedOrigins } from "./client-spans.js";
import { createWizeLens } from "./wizelens.js";

const wl = createWizeLens({ service: "api", storage: "memory", instrumentFetch: false });
const app: Running = await startApp(wl, () => {});
afterAll(() => app.close());

async function post(remote: string, origin: string): Promise<string> {
  const traceId = newTraceId();
  const span = { traceId, spanId: newSpanId(), name: "pageview /", category: "browser", startMs: Date.now(), attributes: { [ATTR_BROWSER_REMOTE]: remote } };
  const res = await fetch(`${app.base}/_wizelens/api/client-spans`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ spans: [span] }),
  });
  expect(res.status).toBe(204);
  return traceId;
}

it("federates to the page's own server, named by a browser span", async () => {
  const traceId = await post("http://localhost:3022/_wizelens/", "http://localhost:3022");
  expect(wl.store.get(traceId)!.remotes).toEqual(["http://localhost:3022/_wizelens"]);
});

it("ignores a remote on another origin than the page", async () => {
  const traceId = await post("http://10.0.0.5/_wizelens", "http://localhost:3022");
  expect(wl.store.get(traceId)!.remotes).toEqual([]);
});

it("does not list this service as a remote of its own trace", async () => {
  await fetch(`${app.base}/`);
  const traceId = await post(`${app.base}/_wizelens`, app.base);
  expect(wl.store.get(traceId)!.remotes).toEqual([]);
});

it("federates to an API on another origin when the developer trusts it", async () => {
  const trusting = createWizeLens({ service: "web", storage: "memory", instrumentFetch: false, trustedRemotes: ["https://localhost:5099/"] });
  const web = await startApp(trusting, () => {});
  try {
    const span = (traceId: string) => ({ traceId, spanId: newSpanId(), name: "fetch PUT /api/items", category: "browser", startMs: Date.now(), attributes: { [ATTR_BROWSER_REMOTE]: "https://localhost:5099/_wizelens" } });
    const traceId = newTraceId();
    await fetch(`${web.base}/_wizelens/api/client-spans`, { method: "POST", headers: { "content-type": "application/json", origin: "https://localhost:5001" }, body: JSON.stringify({ spans: [span(traceId)] }) });
    expect(trusting.store.get(traceId)!.remotes).toEqual(["https://localhost:5099/_wizelens"]);
  } finally {
    await web.close();
  }
});

it("reads trusted origins from the variable, and drops bad entries", () => {
  expect([...trustedOrigins(undefined, "https://localhost:5099/_wizelens, not a url,http://api.test:8080")]).toEqual(["https://localhost:5099", "http://api.test:8080"]);
  expect(trustedOrigins([], "https://x.test").size).toBe(0);
});
