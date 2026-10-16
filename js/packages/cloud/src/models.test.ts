import { afterEach, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { setupOwner, startCloud } from "./test/cloud.js";
import { span } from "./test/db.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

it("computes page models on the server, for long ranges, with sampling past the cap", async () => {
  let url: string;
  ({ cloud, url } = await startCloud({ now: () => NOW, maxStatsTraces: 3 }));
  const { owner, orgId, projectId } = await setupOwner(url);
  const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
  const spans = [1, 2, 3, 4, 5].map((d) => span(String(d).repeat(32), String(d).repeat(16), { startMs: NOW - d * DAY + 1000 }));
  await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "api" }, spans }) });

  const week = await owner.call<{ meta: { range: string; sampled: unknown }; headlines: { total: { value: number } } }>("GET", `api/models/overview?project=${projectId}&range=7d`);
  expect(week.status).toBe(200);
  expect(week.body.meta).toMatchObject({ range: "7d", sampled: { used: 3, total: 5 } });

  const day = await owner.call<{ total: number; rows: { traceId: string }[] }>("GET", `api/models/requests?project=${projectId}&range=24h`);
  expect(day.body.total).toBe(1);
  expect((await owner.call("GET", `api/models/nope?project=${projectId}`)).status).toBe(404);
  expect((await owner.call("GET", `api/models/overview?project=${projectId}&range=90d`)).status).toBe(400);
});
