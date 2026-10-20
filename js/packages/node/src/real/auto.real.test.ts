import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AutoApp, eventually, type FakeHub, fakeHub, runApp } from "../test/auto-run.js";
import { REAL, REAL_URLS } from "./real.js";

let hub: FakeHub;
let app: AutoApp | undefined;
beforeEach(async () => void (hub = await fakeHub()));
afterEach(async () => {
  await app?.stop();
  await hub.close();
});

describe.skipIf(!REAL)("the auto install on real clients", { timeout: 60_000 }, () => {
  it("traces ioredis, node-redis, MongoDB, Elasticsearch, BullMQ, and SQS in an ES module app with no WizeLens code", async () => {
    const env = { WIZELENS_TEST_REDIS: REAL_URLS.redis, WIZELENS_TEST_MONGO: REAL_URLS.mongo, WIZELENS_TEST_ELASTIC: REAL_URLS.elastic, WIZELENS_TEST_SQS: REAL_URLS.sqs };
    app = await runApp("stores.mjs", { WIZELENS_HUB: hub.url, OTEL_SERVICE_NAME: "auto-stores", ...env });
    expect((await app.get("/stores")).status).toBe(200);
    const request = () => hub.spans.find((s) => s.kind === "server" && s.name === "GET /stores");
    const adapters = () => new Set(hub.spans.filter((s) => s.traceId === request()?.traceId).map((s) => String(s.attributes["wizelens.db.adapter"] ?? s.attributes["messaging.system"] ?? "")));
    const wanted = ["ioredis", "redis", "mongodb", "elasticsearch", "bullmq", "aws_sqs"];
    await eventually(() => wanted.every((a) => adapters().has(a)), 20_000).catch(() => undefined);
    expect(wanted.filter((a) => !adapters().has(a))).toEqual([]);
  });
});
