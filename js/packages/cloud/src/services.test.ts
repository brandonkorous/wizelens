import type { HubSender } from "@wizeworks/lens-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db/db.js";
import { createProject } from "./repo/projects.js";
import { forgetOfflineServices, pruneServices } from "./repo/services.js";
import { listServices } from "./repo/trace-read.js";
import { writeService } from "./repo/trace-write.js";
import type { Cloud } from "./server.js";
import { invite, joinWithInvite, setupOwner, startCloud } from "./test/cloud.js";
import { seedOrg, testDb } from "./test/db.js";

const DAY = 86_400_000;
const NOW = 100 * DAY;
const send = (db: Db, projectId: string, sender: HubSender, at: number) => writeService(db, projectId, { sender, via: "addon", spans: [], logs: [], remotes: [] }, at);
const hosts = async (db: Db, projectId: string) => (await listServices(db, projectId, NOW)).map((s) => s.host).sort();

describe("service registry cleanup", () => {
  let db: Db;
  let projectId: string;
  beforeEach(async () => {
    db = await testDb();
    projectId = (await createProject(db, (await seedOrg(db, "Acme", 7)).orgId, "Shop", 0)).id;
  });
  afterEach(() => db.close());

  it("drops hosts not heard from within the organization's retention", async () => {
    await send(db, projectId, { service: "api", host: "api-old" }, NOW - 8 * DAY);
    await send(db, projectId, { service: "api", host: "api-new" }, NOW - 6 * DAY);
    expect(await pruneServices(db, NOW)).toBe(1);
    expect(await hosts(db, projectId)).toEqual(["api-new"]);
  });

  it("uses each organization's own retention", async () => {
    const other = (await createProject(db, (await seedOrg(db, "Long", 90)).orgId, "Long", 0)).id;
    await send(db, other, { service: "api", host: "api-1" }, NOW - 8 * DAY);
    expect(await pruneServices(db, NOW)).toBe(0);
    expect(await hosts(db, other)).toEqual(["api-1"]);
  });

  it("forgets offline hosts but keeps online ones and the newest host of each service", async () => {
    await send(db, projectId, { service: "api", environment: "prod", host: "api-1" }, NOW - DAY);
    await send(db, projectId, { service: "api", environment: "prod", host: "api-2" }, NOW - 60_000);
    await send(db, projectId, { service: "api", environment: "prod", host: "api-3" }, NOW);
    await send(db, projectId, { service: "api", environment: "staging", host: "api-s" }, NOW - DAY);
    await send(db, projectId, { service: "cron", environment: "prod", host: "cron-1" }, NOW - 2 * DAY);
    await send(db, projectId, { service: "cron", environment: "prod", host: "cron-2" }, NOW - DAY);
    expect(await forgetOfflineServices(db, projectId, NOW)).toBe(3);
    expect(await hosts(db, projectId)).toEqual(["api-3", "api-s", "cron-2"]);
  });

  it("treats services of different sender projects apart", async () => {
    await send(db, projectId, { service: "api", project: "a", host: "a-1" }, NOW - DAY);
    await send(db, projectId, { service: "api", project: "b", host: "b-1" }, NOW);
    expect(await forgetOfflineServices(db, projectId, NOW)).toBe(0);
  });
});

describe("forget offline hosts over HTTP", () => {
  let cloud: Cloud;
  afterEach(async () => {
    await cloud?.close();
    cloud = undefined!;
  });

  it("lets admins forget, writes the audit log, and refuses viewers", async () => {
    let url: string;
    ({ cloud, url } = await startCloud());
    const { owner, orgId, projectId } = await setupOwner(cloud, url);
    const at = Date.now();
    await send(cloud.app.db, projectId, { service: "api", host: "api-old" }, at - DAY);
    await send(cloud.app.db, projectId, { service: "api", host: "api-new" }, at);
    const vic = await joinWithInvite(url, await invite(owner, orgId, "vic@acme.io", "viewer"), "vic@acme.io");
    expect((await vic.call("POST", `api/projects/${projectId}/services/forget`)).status).toBe(403);
    const done = await owner.call<{ removed: number }>("POST", `api/projects/${projectId}/services/forget`);
    expect(done).toMatchObject({ status: 200, body: { removed: 1 } });
    const list = await owner.call<{ services: { host: string }[] }>("GET", `api/services?project=${projectId}`);
    expect(list.body.services.map((s) => s.host)).toEqual(["api-new"]);
    const audit = (await owner.call<{ action: string; detail: { removed?: number } }[]>("GET", `api/orgs/${orgId}/audit`)).body;
    expect(audit.find((a) => a.action === "service.forget")?.detail.removed).toBe(1);
  });
});
