import { afterEach, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { mailbox, startCloud } from "../test/cloud.js";
import { span } from "../test/db.js";
import { confirmedOwner, ingest, subjects, until } from "../test/notify.js";
import { checkHealth } from "./health.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

const HOUR = 3_600_000;
const LAST = Date.UTC(2026, 9, 19, 12, 0);
const hourly = (hours: number, endMs: number, seed: number) =>
  Array.from({ length: hours }, (_, i) => span((seed * 1000 + i).toString(16).padStart(32, "0"), (seed * 1000 + i).toString(16).padStart(16, "0"), { startMs: endMs - i * HOUR }));

it("tells managers when a project that sends every hour goes quiet, and when it is back", async () => {
  const box = mailbox();
  const clock = { now: LAST + 10 * 60_000 };
  let url: string;
  ({ cloud, url } = await startCloud({ jobs: false, sendMail: box.sendMail, now: () => clock.now }));
  const { owner, orgId, projectId } = await confirmedOwner(cloud, url, box);
  await ingest(url, owner, orgId, projectId, hourly(72, LAST, 1));
  await checkHealth(cloud.app);
  clock.now = LAST + 3 * HOUR;
  await checkHealth(cloud.app);
  await until(() => subjects(box, "owner@acme.io").includes("My app stopped sending data to WizeLens"));
  await checkHealth(cloud.app);
  await ingest(url, owner, orgId, projectId, hourly(1, clock.now - 60_000, 2));
  await checkHealth(cloud.app);
  await until(() => subjects(box, "owner@acme.io").includes("My app is sending data to WizeLens again"));
  expect(subjects(box, "owner@acme.io").filter((s) => s.includes("stopped sending"))).toHaveLength(1);
});

it("stays silent for a project that only sends now and then", async () => {
  const box = mailbox();
  const clock = { now: LAST + 10 * 60_000 };
  let url: string;
  ({ cloud, url } = await startCloud({ jobs: false, sendMail: box.sendMail, now: () => clock.now }));
  const { owner, orgId, projectId } = await confirmedOwner(cloud, url, box);
  await ingest(url, owner, orgId, projectId, hourly(10, LAST, 3));
  await checkHealth(cloud.app);
  clock.now = LAST + 12 * HOUR;
  await checkHealth(cloud.app);
  await new Promise((r) => setTimeout(r, 100));
  expect(box.sent.filter((m) => m.kind === "health")).toHaveLength(0);
});
