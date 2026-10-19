import { afterEach, expect, it } from "vitest";
import type { SavedSearch } from "@wizeworks/lens-core";
import type { Hub } from "./hub.js";
import { startHub } from "./test/helpers.js";

let hub: Hub | undefined;
afterEach(async () => {
  await hub?.close();
  hub = undefined;
});

it("saves, lists per project, and deletes log searches", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  const api = `${url}/_wizelens/api/saved-searches`;
  const post = (body: unknown, project = "shop") => fetch(`${api}?project=${project}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const made = (await (await post({ name: " Timeouts ", params: { level: "error", q: "timeout", bogus: "x" } })).json()) as { search: SavedSearch };
  expect(made.search).toMatchObject({ kind: "logs", name: "Timeouts", params: { level: "error", q: "timeout" } });
  expect((await post({ name: "" })).status).toBe(400);
  await post({ name: "Other project" }, "crm");
  const listed = (await (await fetch(`${api}?project=shop&kind=logs`)).json()) as { searches: SavedSearch[] };
  expect(listed.searches.map((s) => s.name)).toEqual(["Timeouts"]);
  expect((await fetch(`${api}/${made.search.id}`, { method: "DELETE" })).status).toBe(204);
  expect((await fetch(`${api}/${made.search.id}`, { method: "DELETE" })).status).toBe(404);
  const info = (await (await fetch(`${url}/_wizelens/api/info`)).json()) as { capabilities: string[] };
  expect(info.capabilities).toContain("savedSearches");
});
