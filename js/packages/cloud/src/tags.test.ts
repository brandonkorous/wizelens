import { afterEach, expect, it } from "vitest";
import type { TagList, TagRule } from "@wizeworks/lens-core/internal";
import type { Cloud } from "./server.js";
import { CH_LIMIT, CH_URL } from "./test/ch.js";
import { Client, invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";
import { span } from "./test/db.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const NOW = 1_800_000_000_000;
const [STREAM, PAY] = ["1".repeat(32), "2".repeat(32)];

/** A cloud with one stream request and one slow payment, settled into search. */
async function withData(clickhouseUrl?: string) {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => NOW, clickhouseUrl }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const spans = [
    span(STREAM, "1".repeat(16), { startMs: NOW - 120_000, attributes: { "http.request.method": "GET", "url.path": "/mcp", "http.response.header.content-type": "text/event-stream" } }),
    span(PAY, "2".repeat(16), { startMs: NOW - 60_000, durationMs: 400, attributes: { "http.request.method": "POST", "url.path": "/api/pay" } }),
  ];
  await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "api" }, spans }) });
  await cloud.app.telemetry.settle(NOW + 10_000, { budgetMs: Number.POSITIVE_INFINITY });
  return { url, owner, orgId, projectId };
}

async function matchAndSearch(clickhouseUrl?: string): Promise<void> {
  const { owner, projectId } = await withData(clickhouseUrl);
  await owner.call("POST", `api/tags?project=${projectId}`, { name: "slow", color: "red", query: "duration:>300ms" });
  const items = [{ traceId: STREAM, owner: "", timeMs: NOW - 120_000 }, { traceId: PAY, owner: "", timeMs: NOW - 60_000 }];
  const matched = await owner.call<{ matches: Record<string, string[]> }>("POST", `api/tags/match?project=${projectId}`, { kind: "requests", items });
  expect(matched.body.matches).toEqual({ [`${STREAM} `]: ["stream"], [`${PAY} `]: ["slow"] });
  const q = encodeURIComponent("tag:stream OR tag:slow OR tag:typo");
  const page = await owner.call<{ items: { traceId: string }[]; unknownTags: string[] }>("GET", `api/search?project=${projectId}&q=${q}&range=1h`);
  expect(page.body.items.map((i) => i.traceId)).toEqual([PAY, STREAM]);
  expect(page.body.unknownTags).toEqual(["typo"]);
  const suggest = await owner.call<{ items: { value: string }[] }>("GET", `api/search/suggest?project=${projectId}&field=tag&prefix=s`);
  expect(suggest.body.items.map((s) => s.value)).toEqual(["stream", "slow"]);
  const list = await owner.call<{ rows: { traceId: string }[] }>("GET", `api/models/requests?project=${projectId}&range=1h&q=${encodeURIComponent("tag:slow")}`);
  expect(list.body.rows.map((r) => r.traceId)).toEqual([PAY]);
}

it("matches tags and expands tag: on Postgres", () => matchAndSearch());

it.skipIf(!CH_URL)("matches tags and expands tag: on ClickHouse", () => matchAndSearch(CH_URL), CH_LIMIT);

it("lets members change tags, audits each change, and checks them", async () => {
  const { owner, orgId, projectId } = await withData();
  const path = `api/tags?project=${projectId}`;
  expect((await owner.call<TagList>("GET", path)).body).toMatchObject({ editable: true, max: 50, tags: [{ name: "stream" }, { name: "probe" }, { name: "bot" }] });
  const made = (await owner.call<TagRule>("POST", path, { name: "Checkout", color: "green", query: "path:/checkout*" })).body;
  expect(made).toMatchObject({ name: "checkout", color: "green", builtIn: false });
  expect((await owner.call("POST", path, { name: "checkout", query: "a" })).status).toBe(400);
  expect((await owner.call("POST", path, { name: "x", query: "-tag:checkout" })).body).toMatchObject({ field: "query" });
  expect((await owner.call<TagRule>("PATCH", `api/tags/${made.id}?project=${projectId}`, { color: "amber" })).body).toMatchObject({ name: "checkout", color: "amber" });
  expect((await owner.call<TagRule>("PATCH", `api/tags/builtin:probe?project=${projectId}`, { enabled: false })).body).toMatchObject({ name: "probe", enabled: false });
  expect((await owner.call("PATCH", `api/tags/builtin:probe?project=${projectId}`, { query: "a" })).status).toBe(400);
  expect((await owner.call("POST", path, { name: "y", query: "a" }, { "X-WizeLens-Client": "" })).status).toBe(403);
  expect((await owner.call("DELETE", `api/tags/${made.id}?project=${projectId}`)).status).toBe(200);
  expect((await owner.call("DELETE", `api/tags/${made.id}?project=${projectId}`)).status).toBe(404);
  const audit = (await owner.call<{ action: string }[]>("GET", `api/orgs/${orgId}/audit`)).body.map((a) => a.action);
  expect(audit).toEqual(expect.arrayContaining(["tag.create", "tag.update", "tag.disable", "tag.delete"]));
  expect((await owner.call<TagList>("GET", path)).body.tags.find((t) => t.name === "probe")?.enabled).toBe(false);
});

it("lets viewers and read keys read tags, never change them", async () => {
  const { url, owner, orgId, projectId } = await withData();
  const path = `api/tags?project=${projectId}`;
  const viewer = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "viewer"), "vic@acme.io");
  expect((await viewer.call<TagList>("GET", path)).body.editable).toBe(false);
  expect((await viewer.call("POST", path, { name: "x", query: "a" })).status).toBe(403);
  const read = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "read", name: "agent", projectIds: [projectId] })).body.token;
  const agent = new Client(url);
  expect((await agent.call<TagList>("GET", path, undefined, { Authorization: `Bearer ${read}` })).body.editable).toBe(false);
  expect((await agent.call("POST", path, { name: "x", query: "a" }, { Authorization: `Bearer ${read}` })).status).toBe(403);
  expect((await new Client(url).call("GET", path)).status).toBe(401);
});
