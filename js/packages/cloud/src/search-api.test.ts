import { afterEach, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { setupOwner, startCloud } from "./test/cloud.js";
import { span } from "./test/db.js";
import { CH_URL } from "./test/ch.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const NOW = 1_800_000_000_000;
const q = (s: string) => encodeURIComponent(s);

/** The same API on both telemetry stores: Postgres (small mode) and ClickHouse (scale mode, when a test server is set). */
async function searchApi(clickhouseUrl?: string): Promise<void> {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => NOW, clickhouseUrl }));
  const { owner, orgId, projectId } = await setupOwner(cloud, url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const spans = [1, 2, 3].map((i) => span(String(i).repeat(32), String(i).repeat(16), { startMs: NOW - i * 60_000, attributes: { "http.request.method": "GET", "url.path": "/orders", "tenant.id": i } }));
  await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "api" }, spans }) });
  await cloud.app.telemetry.settle(NOW + 10_000, { budgetMs: Number.POSITIVE_INFINITY });

  type Page = { items: { traceId: string }[]; next: string | null };
  const first = await owner.call<Page>("GET", `api/search?project=${projectId}&kind=spans&q=${q("@tenant.id:>=2 path:/orders")}&range=1h&limit=1`);
  expect(first.status).toBe(200);
  expect(first.body.items.map((i) => i.traceId)).toEqual(["2".repeat(32)]);
  const second = await owner.call<Page>("GET", `api/search?project=${projectId}&kind=spans&q=${q("@tenant.id:>=2 path:/orders")}&range=1h&limit=1&cursor=${q(first.body.next!)}`);
  expect(second.body).toMatchObject({ items: [{ traceId: "3".repeat(32) }], next: null });

  const bad = await owner.call<{ start: number; end: number }>("GET", `api/search?project=${projectId}&q=${q("a OR")}`);
  expect(bad.status).toBe(400);
  expect(bad.body).toMatchObject({ start: 2, end: 4 });
  expect((await owner.call("GET", `api/search?project=${projectId}&range=90d`)).status).toBe(400);
  expect((await owner.call("GET", "api/search")).status).toBe(400);

  const keys = await owner.call<{ items: { value: string }[] }>("GET", `api/search/suggest?project=${projectId}&prefix=@ten&range=1h`);
  expect(keys.body.items).toEqual([{ value: "@tenant.id", count: 3 }]);
}

it("searches one project on the server, pages with a cursor, and suggests values", () => searchApi());

it.skipIf(!CH_URL)("does the same with telemetry in ClickHouse", () => searchApi(`${CH_URL.replace(/\/$/, "")}/wl_test_api_${Date.now().toString(36)}`), 60_000);
