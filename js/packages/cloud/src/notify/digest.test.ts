import { afterEach, expect, it } from "vitest";
import type { Cloud } from "../server.js";
import { settleCloud } from "../settle.js";
import { mailbox, startCloud } from "../test/cloud.js";
import { span } from "../test/db.js";
import { confirmedOwner, ingest, until } from "../test/notify.js";
import { dueKeys, localOf, sendDigests } from "./digest.js";

let cloud: Cloud;
afterEach(async () => {
  await cloud?.close();
  cloud = undefined!;
});

// Monday 2026-10-19, 09:00 UTC (02:00 in Los Angeles).
const MONDAY_9 = Date.UTC(2026, 9, 19, 9, 0);

it("finds the local date and hour, and which digests are due", () => {
  expect(localOf(MONDAY_9, "UTC")).toMatchObject({ date: "2026-10-19", weekday: 1, hour: 9 });
  expect(localOf(MONDAY_9, "America/Los_Angeles")).toMatchObject({ date: "2026-10-19", weekday: 1, hour: 2 });
  expect(localOf(MONDAY_9, "Not/AZone")).toMatchObject({ hour: 9 });
  expect(dueKeys(localOf(MONDAY_9, "UTC"), 8)).toEqual([["daily", "D:2026-10-19"], ["weekly", "W:2026-10-19"]]);
  expect(dueKeys(localOf(MONDAY_9, "America/Los_Angeles"), 8)).toEqual([]);
  expect(dueKeys(localOf(Date.UTC(2026, 10, 1, 8), "UTC"), 8).map(([p]) => p)).toEqual(["daily", "monthly"]);
});

async function withTraffic() {
  const box = mailbox();
  const clock = { now: MONDAY_9 };
  let url: string;
  ({ cloud, url } = await startCloud({ jobs: false, sendMail: box.sendMail, now: () => clock.now }));
  const o = await confirmedOwner(cloud, url, box);
  const spans = Array.from({ length: 12 }, (_, i) =>
    span(i.toString(16).padStart(32, "0"), i.toString(16).padStart(16, "0"), {
      startMs: MONDAY_9 - (i + 1) * 3_600_000,
      durationMs: 40 + i * 10,
      status: i % 4 === 0 ? "error" : "unset",
      attributes: { "http.request.method": "GET", "url.path": "/orders", "http.response.status_code": i % 4 === 0 ? 500 : 200 },
    }),
  );
  await ingest(url, o.owner, o.orgId, o.projectId, spans);
  await settleCloud(cloud.app.db, MONDAY_9 + 10_000);
  box.sent.length = 0;
  return { box, clock, url, ...o };
}

it("sends the weekly digest on Monday morning, once, with the week's numbers", async () => {
  const { box, owner, orgId } = await withTraffic();
  await owner.call("POST", `api/orgs/${orgId}/projects`, { name: "Quiet app" });
  await sendDigests(cloud.app);
  await sendDigests(cloud.app);
  await until(() => box.sent.some((m) => m.kind === "digest"));
  await new Promise((r) => setTimeout(r, 100));
  const digests = box.sent.filter((m) => m.kind === "digest");
  expect(digests).toHaveLength(1);
  expect(digests[0]!.subject).toBe("My app: your week on WizeLens (12 requests, 25% errors)");
  expect(digests[0]!.text).toContain("Slowest endpoints (p95)");
  expect(digests[0]!.text).toContain("Stop the weekly digest for My app:");
  expect(digests[0]!.headers?.["List-Unsubscribe"]).toMatch(/^<http.+api\/mail\/unsubscribe\?token=.+>$/);
});

it("follows each person's choices: daily on, weekly off, and the time zone", async () => {
  const { box, owner, projectId, clock } = await withTraffic();
  expect((await owner.call<{ zoneSet: boolean }>("GET", "api/me/notifications")).body.zoneSet).toBe(false);
  const set = await owner.call<{ zoneSet: boolean; projects: { projectId: string; daily: boolean; weekly: boolean }[] }>("PATCH", "api/me/notifications", {
    timeZone: "America/Los_Angeles",
    projects: [{ projectId, daily: true, weekly: false }],
  });
  expect(set.status).toBe(200);
  expect(set.body.projects[0]).toMatchObject({ daily: true, weekly: false });
  expect(set.body.zoneSet).toBe(true);
  await sendDigests(cloud.app);
  await new Promise((r) => setTimeout(r, 100));
  expect(box.sent.filter((m) => m.kind === "digest")).toHaveLength(0);
  clock.now = MONDAY_9 + 7 * 3_600_000;
  await sendDigests(cloud.app);
  await until(() => box.sent.some((m) => m.kind === "digest"));
  expect(box.sent.find((m) => m.kind === "digest")!.subject).toContain("your day on WizeLens");
});

it("checks the settings it is sent, and digests off stops them all", async () => {
  const { box, owner } = await withTraffic();
  expect((await owner.call("PATCH", "api/me/notifications", { timeZone: "Mars/Olympus" })).status).toBe(400);
  expect((await owner.call("PATCH", "api/me/notifications", { digestHour: 24 })).status).toBe(400);
  expect((await owner.call("PATCH", "api/me/notifications", { projects: [{ projectId: "nope", daily: true }] })).status).toBe(404);
  const off = await owner.call<{ digests: boolean; team: boolean }>("PATCH", "api/me/notifications", { digests: false });
  expect(off.body).toMatchObject({ digests: false, team: true });
  await sendDigests(cloud.app);
  await new Promise((r) => setTimeout(r, 100));
  expect(box.sent.filter((m) => m.kind === "digest")).toHaveLength(0);
});
