import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import type { UptimeCheck, UptimeList, UptimeModel } from "@wizeworks/lens-core";
import type { Hub } from "../hub.js";
import { settleQuietly } from "../settle.js";
import { startHub } from "../test/helpers.js";

let hub: Hub;
let target: Server;
afterEach(async () => {
  target?.close();
  await hub?.close();
});

/** A site that answers 200 until `down` is set. */
async function site(): Promise<{ url: string; state: { down: boolean } }> {
  const state = { down: false };
  target = createServer((_req, res) => res.writeHead(state.down ? 500 : 200).end("hello"));
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(target.address() as AddressInfo).port}/`, state };
}

const send = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

it("adds a check, runs it, keeps incidents, and writes results as wizelens-uptime requests", async () => {
  const clock = { now: Date.now() };
  let url: string;
  ({ hub, url } = await startHub({ now: () => clock.now }));
  const { url: siteUrl, state } = await site();
  const api = `${url}/_wizelens/api/uptime`;
  const made = await send(api, "POST", { name: "Site", url: siteUrl, intervalMin: 1, headers: { Authorization: "Bearer x" }, project: "shop" });
  expect(made.status).toBe(201);
  const check = (await made.json()) as UptimeCheck;
  expect(check.headers).toEqual({ Authorization: "[redacted]" });
  expect(((await (await send(`${api}/${check.id}/run`, "POST")).json()) as UptimeCheck).state).toBe("up");
  state.down = true;
  clock.now += 60_000;
  await send(`${api}/${check.id}/run`, "POST");
  clock.now += 120_000;
  const list = (await (await fetch(`${api}?project=shop`)).json()) as UptimeList;
  expect(list.checks[0]).toMatchObject({ state: "down", lastStatus: 500, lastError: "Expected status 200-299, got 500 (failed twice in a row)" });
  expect(list.incidents).toEqual([expect.objectContaining({ checkName: "Site", endMs: null })]);
  expect(list.checks[0]!.uptime["24h"]).toBeLessThan(100);
  expect((await (await fetch(`${api}?project=other`)).json()) as UptimeList).toMatchObject({ checks: [] });
  settleQuietly(hub.data.store);
  const model = (await (await fetch(`${url}/_wizelens/api/models/uptime?range=1h&project=shop`)).json()) as UptimeModel;
  expect(model.checks).toEqual([expect.objectContaining({ checkId: check.id, runs: 2, failures: 1 })]);
});

it("refuses changes from other sites and bad checks", async () => {
  let url: string;
  ({ hub, url } = await startHub());
  const api = `${url}/_wizelens/api/uptime`;
  expect((await send(api, "POST", { url: "https://example.com" }, { Origin: "https://evil.example" })).status).toBe(403);
  expect((await send(api, "POST", { url: "ftp://example.com" })).status).toBe(400);
  const made = (await (await send(api, "POST", { url: "https://example.com", enabled: false })).json()) as UptimeCheck;
  const changed = (await (await send(`${api}/${made.id}`, "PATCH", { intervalMin: 30 })).json()) as UptimeCheck;
  expect(changed).toMatchObject({ intervalMin: 30, enabled: false, url: "https://example.com" });
  expect((await send(`${api}/${made.id}`, "DELETE")).status).toBe(200);
  expect((await send(`${api}/${made.id}`, "DELETE")).status).toBe(404);
});

it("says so when uptime checks are off", async () => {
  let url: string;
  ({ hub, url } = await startHub({ uptime: false }));
  const info = (await (await fetch(`${url}/_wizelens/api/info`)).json()) as { capabilities: string[] };
  expect(info.capabilities).not.toContain("uptime");
  expect((await fetch(`${url}/_wizelens/api/uptime`)).status).toBe(404);
});
