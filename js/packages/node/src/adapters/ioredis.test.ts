import { afterEach, describe, expect, it } from "vitest";
import { analyzeTrace, type Span } from "@wizeworks/lens-core/internal";
import { createWizeLens } from "../wizelens.js";
import { instrumentIoRedis } from "./ioredis.js";
import { commandText, keyShape } from "./redis-shape.js";

const wizelens = createWizeLens({ service: "ioredis", storage: "memory", traceQueriesOutsideRequests: true });
const dbSpans = (): Span[] => wizelens.store.all().flatMap((t) => t.spans.filter((s) => s.category === "db")).sort((a, b) => a.startMs - b.startMs);
afterEach(() => wizelens.store.clear());

type Callback = (err: Error | null, result?: unknown) => void;

function reply(name: string, args: unknown[]): Promise<unknown> {
  if (args[0] === "bad") return Promise.reject(new Error("WRONGTYPE Operation against a key holding the wrong kind of value"));
  return Promise.resolve(name === "lrange" ? ["a", "b"] : name === "get" ? "secret-value" : "OK");
}

class FakeCommand {
  promise: Promise<unknown> = Promise.resolve();
  constructor(public name: string, public args: unknown[]) {}
}

// Shaped like ioredis: commands go through sendCommand and settle command.promise; pipelines send each command with an isPipeline stream.
class FakeRedis {
  options = { host: "cache.local", port: 6380, db: 2 };
  condition = { select: 2 };
  sendCommand(command: FakeCommand, _stream?: { isPipeline?: boolean }): Promise<unknown> {
    command.promise = reply(command.name, command.args);
    return command.promise;
  }
  call(name: string, args: unknown[], cb?: Callback): Promise<unknown> {
    const out = this.sendCommand(new FakeCommand(name, args));
    if (cb) out.then((r) => cb(null, r), (e: Error) => cb(e));
    return out;
  }
  pipeline(): FakePipeline {
    return new FakePipeline(this);
  }
}

class FakePipeline {
  _queue: FakeCommand[] = [];
  constructor(public redis: FakeRedis) {}
  add(name: string, ...args: unknown[]): this {
    this._queue.push(new FakeCommand(name, args));
    return this;
  }
  exec(): Promise<unknown> {
    for (const c of this._queue) this.redis.sendCommand(c, { isPipeline: true });
    return Promise.all(this._queue.map((c) => c.promise.then((r) => [null, r], (e: unknown) => [e])));
  }
}

const ioredis = Object.assign(FakeRedis, { Pipeline: FakePipeline, Cluster: undefined });

describe("ioredis", () => {
  it("patches the module, a client, and nothing else", () => {
    expect(instrumentIoRedis(wizelens, ioredis)).toBe(true);
    expect(instrumentIoRedis(wizelens, new FakeRedis())).toBe(true);
    expect(instrumentIoRedis(wizelens, {})).toBe(false);
  });

  it("traces promise and callback commands with key shapes, never values", async () => {
    instrumentIoRedis(wizelens, ioredis);
    const client = new FakeRedis();
    await client.call("get", ["user:123"]);
    await new Promise<void>((r) => client.call("set", ["user:42", "hunter2", "EX", 60], () => r()));
    const [get, set] = dbSpans();
    expect(get!.name).toBe("GET");
    expect(get!.attributes).toMatchObject({ "db.system.name": "redis", "db.operation.name": "GET", "db.query.text": "GET user:?", "db.namespace": "2", "server.address": "cache.local", "server.port": 6380, "wizelens.db.adapter": "ioredis" });
    expect(set!.attributes["db.query.text"]).toBe("SET user:?");
    expect(typeof set!.attributes["wizelens.db.fingerprint"]).toBe("string");
    expect(JSON.stringify(dbSpans())).not.toMatch(/hunter2|secret-value|user:42|user:123/);
  });

  it("counts rows of array replies and marks errors", async () => {
    instrumentIoRedis(wizelens, ioredis);
    const client = new FakeRedis();
    await client.call("lrange", ["list:7", 0, -1]);
    await expect(client.call("incr", ["bad"])).rejects.toThrow("WRONGTYPE");
    const [range, incr] = dbSpans();
    expect(range!.attributes["db.response.returned_rows"]).toBe(2);
    expect(incr!.status).toBe("error");
  });
});

describe("ioredis pipelines and analysis", () => {
  it("traces a pipeline and a MULTI as one span each with the command count", async () => {
    instrumentIoRedis(wizelens, ioredis);
    const client = new FakeRedis();
    await client.pipeline().add("get", "user:1").add("set", "user:2", "x").add("get", "user:3").exec();
    await client.pipeline().add("multi").add("incr", "hits:9").add("exec").exec();
    const [pipe, multi] = dbSpans();
    expect(dbSpans()).toHaveLength(2);
    expect(pipe!.attributes).toMatchObject({ "db.operation.name": "PIPELINE", "db.query.text": "PIPELINE GET user:?; SET user:?", "db.operation.batch.size": 3 });
    expect(multi!.attributes).toMatchObject({ "db.operation.name": "MULTI", "db.query.text": "MULTI INCR hits:?", "db.operation.batch.size": 1 });
  });

  it("marks a pipeline with a failed command", async () => {
    instrumentIoRedis(wizelens, ioredis);
    await new FakeRedis().pipeline().add("get", "ok").add("incr", "bad").exec();
    expect(dbSpans()[0]!.status).toBe("error");
  });

  it("finds N+1 and duplicate reads in a request", async () => {
    instrumentIoRedis(wizelens, ioredis);
    const client = new FakeRedis();
    await wizelens.tracer.startActiveSpan("GET /cart", async (root) => {
      for (const id of [1, 2, 3, 4, 5]) await client.call("get", [`product:${id}`]);
      await client.call("get", ["product:1"]);
      root.end();
    });
    const trace = wizelens.store.all().find((t) => t.spans.some((s) => s.name === "GET /cart"))!;
    const findings = analyzeTrace(trace);
    expect(findings.find((f) => f.kind === "n+1-db")).toMatchObject({ shape: "GET product:?", count: 6 });
    expect(findings.find((f) => f.kind === "duplicate-query")?.count).toBe(2);
  });
});

describe("redis key shapes", () => {
  it("keep the key and hide ids, emails, and tokens", () => {
    expect(keyShape("user:123:cart")).toBe("user:?:cart");
    expect(keyShape("sess:Q1x8fjKk0zLm")).toBe("sess:?");
    expect(keyShape("login:bob@example.com")).toBe("login:?");
    expect(keyShape("cache:/api/orders")).toBe("cache:/api/orders");
    expect(keyShape(Buffer.from("x"))).toBe("?");
  });

  it("show only keys: no password, script, or value", () => {
    expect(commandText("auth", ["admin", "s3cret"])).toBe("AUTH");
    expect(commandText("mset", ["a:1", "v1", "a:2", "v2"])).toBe("MSET a:?");
    expect(commandText("evalsha", ["abc", 2, "k:1", "j:2", "arg"])).toBe("EVALSHA k:? j:?");
    expect(commandText("blpop", ["q:1", "q:2", 5])).toBe("BLPOP q:?");
    expect(commandText("publish", ["news", "hello"])).toBe("PUBLISH news");
  });
});
