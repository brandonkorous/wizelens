import { afterEach, describe, expect, it } from "vitest";
import { analyzeTrace, type Span } from "@wizeworks/lens-core";
import { createWizeLens } from "../wizelens.js";
import { instrumentMongoDb } from "./mongodb.js";
import { docShape } from "./mongodb-shape.js";

const wizelens = createWizeLens({ serviceName: "mongodb", storage: "memory", traceQueriesOutsideRequests: true });
const dbSpans = (): Span[] => wizelens.store.all().flatMap((t) => t.spans.filter((s) => s.category === "db")).sort((a, b) => a.startMs - b.startMs);
afterEach(() => wizelens.store.clear());

type Callback = (err: Error | null, result?: unknown) => void;
const DOCS = [{ _id: 1, email: "ann@example.com" }, { _id: 2, email: "bob@example.com" }];

// Shaped like the driver's cursors: no I/O until the first fetch.
class FakeCursor {
  private i = 0;
  findOptions: Record<string, unknown> = {};
  constructor(private docs: unknown[]) {}
  async toArray(): Promise<unknown[]> {
    return this.docs;
  }
  async next(): Promise<unknown> {
    return this.docs[this.i++] ?? null;
  }
  limit(n: number): this {
    this.findOptions.limit = n;
    return this;
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<unknown> {
    for (const d of this.docs) yield d;
  }
}

// Shaped like the driver's Collection: findOne runs on find, as the real one does.
class FakeCollection {
  collectionName = "orders";
  dbName = "shop";
  client = { options: { hosts: [{ host: "mongo.local", port: 27017 }] } };
  find(_filter?: unknown): FakeCursor {
    return new FakeCursor(DOCS);
  }
  aggregate(_pipeline: unknown[]): FakeCursor {
    return new FakeCursor([{ _id: "paid", n: 2 }]);
  }
  findOne(filter: unknown): Promise<unknown> {
    return this.find(filter).limit(1).next();
  }
  async insertMany(docs: unknown[]): Promise<unknown> {
    return { acknowledged: true, insertedCount: docs.length, insertedIds: {} };
  }
  async updateOne(_filter: unknown, _update: unknown): Promise<unknown> {
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
  }
  async deleteMany(_filter: unknown): Promise<unknown> {
    throw new Error("not primary");
  }
  async bulkWrite(ops: unknown[]): Promise<unknown> {
    return { insertedCount: 1, modifiedCount: 1, deletedCount: 1, upsertedCount: 0, ops: ops.length };
  }
  countDocuments(_filter: unknown, cb?: Callback): unknown {
    if (cb) return void setTimeout(() => cb(null, 5), 1);
    return Promise.resolve(5);
  }
}

describe("mongodb", () => {
  it("finds the Collection prototype from the module, a Db, a client, or a collection", () => {
    expect(instrumentMongoDb(wizelens, { Collection: FakeCollection })).toBe(true);
    expect(instrumentMongoDb(wizelens, { collection: () => new FakeCollection() })).toBe(true);
    expect(instrumentMongoDb(wizelens, { db: () => ({ collection: () => new FakeCollection() }) })).toBe(true);
    expect(instrumentMongoDb(wizelens, new FakeCollection())).toBe(true);
    expect(instrumentMongoDb(wizelens, {})).toBe(false);
  });

  it("traces a find with its filter shape, rows, database, and server, never the values", async () => {
    instrumentMongoDb(wizelens, { Collection: FakeCollection });
    const orders = new FakeCollection();
    expect(await orders.find({ status: "paid", total: { $gt: 98765 }, _id: { $in: [1, 2, 3] } }).toArray()).toHaveLength(2);
    const [span] = dbSpans();
    expect(span!.name).toBe("find orders");
    expect(span!.attributes).toMatchObject({
      "db.system.name": "mongodb", "db.operation.name": "find", "db.collection.name": "orders", "db.namespace": "shop",
      "db.query.text": 'find orders {"status":?,"total":{"$gt":?},"_id":{"$in":?}}', "db.response.returned_rows": 2, "server.address": "mongo.local", "server.port": 27017,
    });
    expect(JSON.stringify(dbSpans().map((s) => s.attributes))).not.toMatch(/paid|98765|ann@example/);
  });

  it("makes one span per cursor and per findOne, whatever runs inside", async () => {
    instrumentMongoDb(wizelens, { Collection: FakeCollection });
    const orders = new FakeCollection();
    const cursor = orders.find({});
    await cursor.next();
    await cursor.next();
    for await (const _ of orders.find({ status: "new" })) void _;
    expect(await orders.findOne({ _id: 1 })).toMatchObject({ _id: 1 });
    expect(dbSpans().map((s) => s.attributes["db.query.text"])).toEqual(["find orders {}", 'find orders {"status":?}', 'findOne orders {"_id":?}']);
    expect(dbSpans()[2]!.attributes["db.response.returned_rows"]).toBe(1);
  });
});

describe("mongodb writes and analysis", () => {
  it("traces writes, aggregates, callbacks, and errors", async () => {
    instrumentMongoDb(wizelens, { Collection: FakeCollection });
    const orders = new FakeCollection();
    await orders.insertMany([{ email: "x@y.z" }, { email: "w@y.z" }]);
    await orders.updateOne({ _id: 7 }, { $set: { status: "shipped" } });
    await orders.aggregate([{ $match: { status: "paid" } }, { $group: { _id: "$customer", n: { $sum: 1 } } }]).toArray();
    await new Promise<void>((r) => orders.countDocuments({ status: "paid" }, () => r()));
    await orders.bulkWrite([{ insertOne: {} }, { deleteOne: {} }]);
    await expect(orders.deleteMany({ old: true })).rejects.toThrow("not primary");
    const [insert, update, aggregate, count, bulk, del] = dbSpans();
    expect(insert!.attributes).toMatchObject({ "db.query.text": "insertMany orders", "db.response.returned_rows": 2 });
    expect(update!.attributes).toMatchObject({ "db.query.text": 'updateOne orders {"_id":?} {"$set":{"status":?}}', "db.response.returned_rows": 1 });
    expect(aggregate!.attributes["db.query.text"]).toBe('aggregate orders [{"$match":{"status":?}},{"$group":{"_id":?,"n":{"$sum":?}}}]');
    expect(count!.attributes["db.query.text"]).toBe('countDocuments orders {"status":?}');
    expect(bulk!.attributes).toMatchObject({ "db.operation.batch.size": 2, "db.response.returned_rows": 3 });
    expect(del!.status).toBe("error");
    expect(JSON.stringify(dbSpans())).not.toMatch(/x@y\.z|shipped|\$customer/);
  });

  it("finds N+1 and duplicate lookups in a request", async () => {
    instrumentMongoDb(wizelens, { Collection: FakeCollection });
    const users = new FakeCollection();
    await wizelens.tracer.startActiveSpan("GET /orders", async (root) => {
      for (const id of [1, 2, 3, 4, 5]) await users.findOne({ _id: id });
      await users.findOne({ _id: 1 });
      root.end();
    });
    const trace = wizelens.store.all().find((t) => t.spans.some((s) => s.name === "GET /orders"))!;
    const findings = analyzeTrace(trace);
    expect(findings.find((f) => f.kind === "n+1-db")).toMatchObject({ shape: 'findOne orders {"_id":?}', count: 6 });
    expect(findings.find((f) => f.kind === "duplicate-query")?.count).toBe(2);
  });
});

describe("mongodb shapes", () => {
  it("keep field names and operators and hide every value", () => {
    expect(docShape({ "items.0.qty": { $gte: 2 }, $or: [{ a: 1 }, { b: "x" }, { a: 2 }] })).toBe('{"items.?.qty":{"$gte":?},"$or":[{"a":?},{"b":?}]}');
    expect(docShape({ when: new Date(), tags: [] })).toBe('{"when":?,"tags":[]}');
    expect(docShape("plain")).toBe("?");
  });
});
