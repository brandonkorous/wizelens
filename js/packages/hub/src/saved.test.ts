import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { startHub } from "./test/helpers.js";

let hub: Hub;
afterEach(() => hub?.close());

const call = async <T>(url: string, method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}/_wizelens/${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as T };
};

it("keeps saved views, searches, and dashboards per project, all shared", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  expect((await call<{ capabilities: string[] }>(url, "GET", "api/info")).body.capabilities).toContain("saved");
  const view = await call<{ id: string; shared: boolean }>(url, "POST", "api/saved?project=shop", { kind: "view", name: "Slow", href: "#/requests?sort=duration" });
  expect(view.body.shared).toBe(true);
  await call(url, "POST", "api/saved?project=shop", { kind: "search", name: "Fails", href: "#/search?q=status:error" });
  expect((await call<{ items: { kind: string }[] }>(url, "GET", "api/saved?project=shop")).body.items.map((i) => i.kind)).toEqual(["view", "search"]);
  expect((await call<{ items: unknown[] }>(url, "GET", "api/saved?project=other")).body.items).toEqual([]);
  expect((await call<{ name: string }>(url, "PATCH", `api/saved/${view.body.id}?project=shop`, { name: "Slowest" })).body.name).toBe("Slowest");
  expect((await call<{ error: string }>(url, "POST", "api/saved?project=shop", { kind: "dashboard", name: "x", panels: [{ type: "line", metrics: [] }] })).body.error).toMatch(/metrics/);
  expect((await call(url, "DELETE", `api/saved/${view.body.id}?project=shop`)).status).toBe(200);
});
