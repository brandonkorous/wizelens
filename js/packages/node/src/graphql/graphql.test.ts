import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Span, Trace } from "@wizeworks/lens-core";
import type { Running } from "../test/helpers.js";
import { type FakeGraphql, type FakeInstall, installFakeGraphql, postQuery, startGraphqlApp } from "../test/graphql-app.js";
import type { WizeLens } from "../types.js";
import { createWizeLens } from "../wizelens.js";
import { instrumentGraphql } from "./index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const make = () => createWizeLens({ serviceName: "graphql-api", storage: "memory", instrumentFetch: false });
const resolvers = {
  orders: () => [{ id: 1 }],
  fast: () => "fast",
  slow: async () => (await sleep(60), "slow"),
};
const mutations = {
  placeOrder: () => {
    throw new Error("out of stock");
  },
};

let wl: WizeLens;
let fake: FakeInstall;
let app: Running;
const cleanups: (() => unknown)[] = [];
afterAll(async () => void (await Promise.all(cleanups.map((c) => c()))));

beforeAll(async () => {
  wl = make();
  fake = installFakeGraphql();
  expect(instrumentGraphql(wl, fake.graphql, { slowResolverMs: 30 })).toBe(true);
  app = await startGraphqlApp(wl, fake.graphql, fake.graphql.makeSchema(resolvers, mutations));
  cleanups.push(() => app.close(), () => wl.shutdown(), () => fake.remove());
});

async function traceOf(w: WizeLens, res: Response): Promise<{ server: Span; spans: Span[] }> {
  expect(res.status).toBe(200);
  await sleep(30);
  const t = w.store.get(res.headers.get("x-wizelens-trace")!) as Trace;
  return { server: t.spans.find((s) => s.kind === "server")!, spans: t.spans };
}

const QUERY = 'query GetOrders($id: ID!) { orders(first: 10, status: "open") { id } } # by customer';

describe("instrumentGraphql", () => {
  it("names the request after the operation and keeps one span per operation, without values", async () => {
    const { server, spans } = await traceOf(wl, await postQuery(app.base, QUERY, { id: "secret-7" }));
    expect(server.name).toBe("POST /graphql (GetOrders)");
    expect(server.attributes["http.route"]).toBe("/graphql (GetOrders)");
    const op = spans.find((s) => s.name === "query GetOrders")!;
    expect(op).toMatchObject({ parentSpanId: server.spanId, category: "internal", status: "unset" });
    expect(op.attributes).toMatchObject({
      "graphql.operation.type": "query",
      "graphql.operation.name": "GetOrders",
      "graphql.document": 'query GetOrders($id: ID!) { orders(first: *, status: "*") { id } }',
    });
    expect(JSON.stringify(op)).not.toContain("secret-7");
  });

  it("records the errors GraphQL answers in the result", async () => {
    const { server, spans } = await traceOf(wl, await postQuery(app.base, "mutation PlaceOrder { placeOrder }"));
    expect(server.name).toBe("POST /graphql (PlaceOrder)");
    const op = spans.find((s) => s.name === "mutation PlaceOrder")!;
    expect(op.status).toBe("error");
    expect(op.attributes["graphql.error.count"]).toBe(1);
    expect(op.events[0]!.attributes).toMatchObject({ "exception.message": "out of stock", "exception.type": "Error", "graphql.error.path": "placeOrder" });
  });

  it("names an anonymous operation by its type", async () => {
    const { server, spans } = await traceOf(wl, await postQuery(app.base, "{ fast }"));
    expect(server.name).toBe("POST /graphql (anonymous query)");
    expect(spans.some((s) => s.name === "query" && s.attributes["graphql.operation.name"] === undefined)).toBe(true);
  });

  it("keeps a span for slow resolvers only", async () => {
    const { spans } = await traceOf(wl, await postQuery(app.base, "query Mixed { slow fast }"));
    const op = spans.find((s) => s.name === "query Mixed")!;
    const slow = spans.find((s) => s.name === "Query.slow")!;
    expect(slow).toMatchObject({ parentSpanId: op.spanId, attributes: { "graphql.field.path": "slow", "graphql.parent.type": "Query" } });
    expect(slow.durationMs).toBeGreaterThanOrEqual(30);
    expect(spans.some((s) => s.name === "Query.fast")).toBe(false);
  });
});

describe("instrumentGraphql outside requests and on graphql's index", () => {
  it("starts nothing outside a request", async () => {
    const before = wl.store.size;
    const result = await fake.graphql.execute({ schema: fake.graphql.makeSchema(resolvers), document: fake.graphql.parse("{ fast }") });
    expect(result).toEqual({ data: { fast: "fast" } });
    await sleep(30);
    expect(wl.store.size).toBe(before);
  });

  it("patches the CommonJS file behind graphql's getters, once", () => {
    const execute = (fake.require("graphql/execution/execute.js") as { execute: object }).execute;
    expect((execute as Record<symbol, unknown>)[Symbol.for("wizeworks.wizelens.graphql")]).toBe(true);
    expect(fake.graphql.execute).toBe(execute);
    expect(instrumentGraphql(wl, fake.graphql)).toBe(true);
    expect(instrumentGraphql(wl, {})).toBe(false);
  });
});

describe("instrumentGraphql with every resolver", () => {
  it("keeps a span around each resolver, with its nested work inside", async () => {
    const w = make();
    const other = installFakeGraphql();
    const lookup = () => w.traceDb({ system: "sqlite" }, "SELECT 1", [], () => [{ one: 1 }]);
    instrumentGraphql(w, other.graphql, { resolvers: "all", document: false });
    const running = await startGraphqlApp(w, other.graphql, other.graphql.makeSchema({ ...resolvers, lookup }));
    cleanups.push(() => running.close(), () => w.shutdown(), () => other.remove());
    const { spans } = await traceOf(w, await postQuery(running.base, "query Both { fast lookup }"));
    const op = spans.find((s) => s.name === "query Both")!;
    expect(op.attributes["graphql.document"]).toBeUndefined();
    const lookupSpan = spans.find((s) => s.name === "Query.lookup")!;
    expect(spans.find((s) => s.name === "Query.fast")!.parentSpanId).toBe(op.spanId);
    expect(spans.find((s) => s.category === "db")!.parentSpanId).toBe(lookupSpan.spanId);
  });

  it("traces GraphQL Yoga's executor (@graphql-tools/executor's normalizedExecutor)", async () => {
    const w = make();
    const other = installFakeGraphql();
    const { run } = other.require("graphql/execution/run.js") as { run: FakeGraphql["execute"] };
    const tools = { normalizedExecutor: (args: Parameters<FakeGraphql["execute"]>[0]) => run(args) };
    expect(instrumentGraphql(w, tools)).toBe(true);
    const yoga = { ...other.graphql, execute:(args: Parameters<FakeGraphql["execute"]>[0]) => tools.normalizedExecutor(args) };
    const running = await startGraphqlApp(w, yoga, other.graphql.makeSchema(resolvers));
    cleanups.push(() => running.close(), () => w.shutdown(), () => other.remove());
    const { server } = await traceOf(w, await postQuery(running.base, "query FromYoga { fast }"));
    expect(server.name).toBe("POST /graphql (FromYoga)");
  });

  it("does nothing when WizeLens is off", () => {
    const off = createWizeLens({ serviceName: "off", enabled: false });
    const unused = installFakeGraphql();
    expect(instrumentGraphql(off, unused.graphql)).toBe(false);
    unused.remove();
  });
});
