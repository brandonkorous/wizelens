import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { settleHub } from "./settle.js";
import { post, span, startHub } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

it("narrows the Requests list to a structured search, and keeps free words as text", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  const at = Date.now() - 60_000;
  const one = (i: number, code: number, path: string) =>
    span(String(i).padStart(32, "c"), String(i).padStart(16, "d"), { startMs: at + i, status: code >= 500 ? "error" : "ok", attributes: { "http.request.method": "GET", "url.path": path, "http.response.status_code": code } });
  await post(`${url}/_wizelens/api/ingest`, { sender: { service: "orders-api" }, spans: [one(1, 200, "/a"), one(2, 500, "/b"), one(3, 503, "/c"), one(4, 200, "/pay")] });
  settleHub(hub.data.store);
  const total = async (q: string) => ((await (await fetch(`${url}/_wizelens/api/models/requests?range=1h&q=${encodeURIComponent(q)}`)).json()) as { total: number }).total;
  expect(await total("status:5xx")).toBe(2);
  expect(await total("NOT status:5xx")).toBe(2);
  expect(await total("pay")).toBe(1);
  expect(await total("")).toBe(4);
});
