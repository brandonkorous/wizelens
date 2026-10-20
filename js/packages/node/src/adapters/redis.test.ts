import { afterEach, describe, expect, it } from "vitest";
import type { Span } from "@wizeworks/lens-core";
import { createWizeLens } from "../wizelens.js";
import { instrumentRedis } from "./redis.js";

const wizelens = createWizeLens({ serviceName: "node-redis", storage: "memory", traceQueriesOutsideRequests: true });
const dbSpans = (): Span[] => wizelens.store.all().flatMap((t) => t.spans.filter((s) => s.category === "db")).sort((a, b) => a.startMs - b.startMs);
afterEach(() => wizelens.store.clear());

function reply(args: readonly unknown[]): unknown {
  if (args[1] === "bad") return new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
  return args[0] === "LRANGE" ? ["a", "b", "c"] : args[0] === "GET" ? "secret-value" : "OK";
}

async function send(args: readonly unknown[]): Promise<unknown> {
  const out = reply(args);
  if (out instanceof Error) throw out;
  return out;
}

type CommandDef = { transformArguments: (...args: string[]) => unknown[] };
const GET: CommandDef = { transformArguments: (key) => ["GET", key] };
const SET: CommandDef = { transformArguments: (key, value) => ["SET", key, value] };
const SCRIPT = { SHA1: "deadbeef", NUMBER_OF_KEYS: 1 };

// Shaped like @redis/client v4: typed commands run through commandsExecutor and a private send, batches through multiExecutor.
class FakeClientV4 {
  options = { url: "redis://cache.local:6390/3" };
  sendCommand(args: unknown[]): Promise<unknown> {
    return send(args);
  }
  commandsExecutor(command: CommandDef, args: unknown[]): Promise<unknown> {
    const rest = typeof args[0] === "object" ? args.slice(1) : args;
    return send(command.transformArguments(...(rest as string[])));
  }
  executeScript(script: typeof SCRIPT, args: unknown[]): Promise<unknown> {
    return send(["EVALSHA", script.SHA1, script.NUMBER_OF_KEYS, ...args]);
  }
  multiExecutor(commands: { args: unknown[] }[], _db?: number, _chainId?: symbol): Promise<unknown[]> {
    return Promise.resolve(commands.map((c) => reply(c.args)));
  }
  get(key: string): Promise<unknown> {
    return this.commandsExecutor(GET, [key]);
  }
}

// Shaped like @redis/client v5: every command goes through the public sendCommand.
class FakeClientV5 {
  options = { socket: { host: "valkey.local", port: 6379 }, database: 0 };
  sendCommand(args: unknown[]): Promise<unknown> {
    return send(args);
  }
  _executeMulti(commands: { args: unknown[] }[]): Promise<unknown[]> {
    return Promise.resolve(commands.map((c) => reply(c.args)));
  }
  _executePipeline(commands: { args: unknown[] }[]): Promise<unknown[]> {
    return this._executeMulti(commands);
  }
  get(key: string): Promise<unknown> {
    return this.sendCommand(["GET", key]);
  }
}

describe("node-redis", () => {
  it("finds the client prototype from the class, a client, or createClient", () => {
    expect(instrumentRedis(wizelens, { default: FakeClientV4 })).toBe(true);
    expect(instrumentRedis(wizelens, { createClient: () => new FakeClientV5() })).toBe(true);
    expect(instrumentRedis(wizelens, new FakeClientV5())).toBe(true);
    expect(instrumentRedis(wizelens, { something: 1 })).toBe(false);
  });

  it("traces v4 typed commands, raw sendCommand, and scripts with key shapes only", async () => {
    instrumentRedis(wizelens, FakeClientV4);
    const client = new FakeClientV4();
    await client.get("user:77");
    await client.commandsExecutor(SET, [{ [Symbol("Command Options")]: true }, "user:78", "hunter2"]);
    await client.sendCommand(["LRANGE", "feed:9", "0", "-1"]);
    await client.executeScript(SCRIPT, ["lock:5", "token-abc"]);
    const spans = dbSpans();
    expect(spans.map((s) => s.attributes["db.query.text"])).toEqual(["GET user:?", "SET user:?", "LRANGE feed:?", "EVALSHA lock:?"]);
    expect(spans[0]!.attributes).toMatchObject({ "db.system.name": "redis", "wizelens.db.adapter": "redis", "db.namespace": "3", "server.address": "cache.local", "server.port": 6390 });
    expect(spans[2]!.attributes["db.response.returned_rows"]).toBe(3);
    expect(JSON.stringify(spans)).not.toMatch(/hunter2|secret-value|token-abc|user:77/);
  });

  it("traces v5 commands and marks errors", async () => {
    instrumentRedis(wizelens, new FakeClientV5());
    const client = new FakeClientV5();
    await client.get("session:abc123");
    await expect(client.sendCommand(["INCR", "bad"])).rejects.toThrow("WRONGTYPE");
    const [get, incr] = dbSpans();
    expect(get!.attributes).toMatchObject({ "db.query.text": "GET session:?", "server.address": "valkey.local", "db.namespace": "0" });
    expect(incr!.status).toBe("error");
  });

  it("traces MULTI and pipelines as one span, and marks a failed reply", async () => {
    instrumentRedis(wizelens, FakeClientV4);
    instrumentRedis(wizelens, FakeClientV5);
    const queue = [{ args: ["SET", "a:1", "x"] }, { args: ["GET", "a:2"] }];
    await new FakeClientV4().multiExecutor(queue, 0, Symbol("chain"));
    await new FakeClientV4().multiExecutor(queue);
    await new FakeClientV5()._executePipeline([...queue, { args: ["INCR", "bad"] }]);
    const [multi, pipe, failed] = dbSpans();
    expect(dbSpans()).toHaveLength(3);
    expect(multi!.attributes).toMatchObject({ "db.operation.name": "MULTI", "db.query.text": "MULTI SET a:?; GET a:?", "db.operation.batch.size": 2 });
    expect(pipe!.attributes["db.operation.name"]).toBe("PIPELINE");
    expect(failed!.status).toBe("error");
  });
});
