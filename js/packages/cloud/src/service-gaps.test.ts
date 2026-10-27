import { afterEach, describe, expect, it } from "vitest";
import type { Cloud } from "./server.js";
import { setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const MIN = 60_000;
const T0 = 1_800_000_000_000;

describe("service gaps", () => {
  it("names the minutes a service sent nothing, not even a heartbeat, and one still open", async () => {
    const clock = { now: T0 };
    let url: string;
    ({ cloud, url } = await startCloud({ now: () => clock.now }));
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const key = (await owner.call<{ token: string }>("POST", `api/orgs/${orgId}/keys`, { kind: "ingest", projectIds: [projectId] })).body.token;
    const beat = async (at: number) => {
      clock.now = at;
      await fetch(`${url}/_wizelens/api/ingest`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify({ sender: { service: "kanninja-backend" }, spans: [], logs: [] }) });
    };
    // Heartbeats for 3 minutes, 4 minutes of nothing (a revoked key), then 2 more minutes: one late minute is no gap.
    for (const m of [0, 1, 2, 7, 8, 10]) await beat(T0 + m * MIN + 5_000);
    const read = async (to: number) => (await owner.call<{ gaps: { startMs: number; endMs: number | null }[] }>("GET", `api/projects/${projectId}/service-gaps?service=kanninja-backend&from=${T0}&to=${to}`)).body.gaps;
    clock.now = T0 + 11 * MIN;
    expect(await read(clock.now)).toEqual([{ startMs: T0 + 3 * MIN, endMs: T0 + 7 * MIN }]);
    clock.now = T0 + 20 * MIN;
    expect(await read(clock.now)).toEqual([{ startMs: T0 + 3 * MIN, endMs: T0 + 7 * MIN }, { startMs: T0 + 11 * MIN, endMs: null }]);
    expect((await owner.call("GET", `api/projects/${projectId}/service-gaps`)).status).toBe(400);
  });
});
