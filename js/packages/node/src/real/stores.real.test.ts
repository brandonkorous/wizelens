import { Client as Elastic } from "@elastic/elasticsearch";
import IoRedis from "ioredis";
import { MongoClient } from "mongodb";
import * as redis from "redis";
import { afterAll, describe, expect, it } from "vitest";
import { analyzeTrace } from "@wizeworks/lens-core";
import { instrumentElasticsearch } from "../adapters/elasticsearch.js";
import { instrumentIoRedis } from "../adapters/ioredis.js";
import { instrumentMongoDb } from "../adapters/mongodb.js";
import { instrumentRedis } from "../adapters/redis.js";
import { inRequest, REAL, REAL_URLS, realLens, spansOf, unique } from "./real.js";

const wizelens = realLens("real-stores");
const closers: (() => Promise<unknown>)[] = [];
afterAll(async () => {
  for (const close of closers) await close().catch(() => undefined);
  await wizelens.shutdown();
});

const text = (s: { attributes: Record<string, unknown> }) => String(s.attributes["db.query.text"]);

describe.skipIf(!REAL)("real data stores", { timeout: 30_000 }, () => {
  it("ioredis: commands, a pipeline, and a MULTI, with keys normalized and no values", async () => {
    expect(instrumentIoRedis(wizelens, IoRedis)).toBe(true);
    const client = new IoRedis(REAL_URLS.redis);
    closers.push(() => client.quit());
    const key = unique("user:");
    const trace = await inRequest(wizelens, async () => {
      await client.set(`${key}:42`, "secret-value");
      for (let i = 0; i < 6; i++) await client.get(`${key}:${i}`);
      await client.pipeline().get(`${key}:1`).incr(`${key}:n`).exec();
      await client.multi().set(`${key}:2`, "x").expire(`${key}:2`, 60).exec();
    });
    const db = spansOf(trace, "db");
    expect(db.map((s) => s.attributes["db.system.name"])).toEqual(db.map(() => "redis"));
    expect(db.some((s) => /^GET \S+:\?$/.test(text(s)))).toBe(true);
    expect(db.find((s) => s.attributes["db.operation.name"] === "PIPELINE")?.attributes["db.operation.batch.size"]).toBe(2);
    expect(JSON.stringify(trace.spans)).not.toContain("secret-value");
    expect(analyzeTrace(trace).map((f) => f.kind)).toContain("n+1-db");
  });

  it("node-redis: commands and a MULTI, joined to the request", async () => {
    expect(instrumentRedis(wizelens, redis)).toBe(true);
    const client = redis.createClient({ url: REAL_URLS.redis });
    await client.connect();
    closers.push(() => client.quit());
    const key = unique("cart:");
    const trace = await inRequest(wizelens, async () => {
      await client.set(`${key}:7`, "hidden-value");
      await client.get(`${key}:7`);
      await client.multi().set(`${key}:8`, "y").get(`${key}:8`).exec();
    });
    const db = spansOf(trace, "db");
    expect(db.length).toBeGreaterThanOrEqual(3);
    expect(db.map(text)).toEqual(expect.arrayContaining([expect.stringMatching(/^GET \S+:\?$/)]));
    expect(db.every((s) => s.parentSpanId)).toBe(true);
    expect(JSON.stringify(trace.spans)).not.toContain("hidden-value");
  });
});

describe.skipIf(!REAL)("real MongoDB and Elasticsearch", { timeout: 30_000 }, () => {
  it("mongodb: inserts, finds, updates, and aggregates, with filter values hidden", async () => {
    expect(instrumentMongoDb(wizelens, await import("mongodb"))).toBe(true);
    const client = await new MongoClient(REAL_URLS.mongo).connect();
    closers.push(() => client.close());
    const orders = client.db(unique("shop")).collection("orders");
    const trace = await inRequest(wizelens, async () => {
      await orders.insertMany([{ status: "paid", total: 12, email: "a@b.c" }, { status: "open", total: 7 }]);
      await orders.find({ status: "paid", total: { $gt: 5 } }).toArray();
      await orders.findOne({ email: "a@b.c" });
      await orders.updateOne({ status: "open" }, { $set: { status: "paid" } });
      await orders.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
    });
    const db = spansOf(trace, "db");
    expect(db.map((s) => s.attributes["db.operation.name"])).toEqual(expect.arrayContaining(["insertMany", "find", "findOne", "updateOne", "aggregate"]));
    expect(db.find((s) => s.attributes["db.operation.name"] === "find")?.attributes["db.response.returned_rows"]).toBe(1);
    expect(db.every((s) => s.attributes["db.collection.name"] === "orders")).toBe(true);
    expect(JSON.stringify(trace.spans)).not.toContain("a@b.c");
  });

  it("elasticsearch: index, get, and search, with ids and bodies left out", async () => {
    expect(instrumentElasticsearch(wizelens, await import("@elastic/elasticsearch"))).toBe(true);
    const es = new Elastic({ node: REAL_URLS.elastic });
    closers.push(() => es.close());
    const index = unique("orders-");
    const trace = await inRequest(wizelens, async () => {
      await es.index({ index, id: "order-123", document: { note: "private-note" }, refresh: true });
      await es.get({ index, id: "order-123" });
      await es.search({ index, query: { match: { note: "private-note" } } });
    });
    const db = spansOf(trace, "db");
    expect(db.map((s) => s.attributes["db.operation.name"])).toEqual(expect.arrayContaining(["index", "get", "search"]));
    expect(db.map(text)).toEqual(expect.arrayContaining([expect.stringMatching(/_doc\/\?$/), expect.stringMatching(/_search$/)]));
    expect(JSON.stringify(trace.spans)).not.toContain("private-note");
    await es.indices.delete({ index });
  });
});
