import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWizeLens } from "./index.js";
import { type Running, startApp } from "./test/helpers.js";

const audit: string[] = [];
const wizelens = createWizeLens({ serviceName: "mcp-api", enabled: true, enableMcp: true, storage: "memory", audit: (l) => audit.push(l) });
const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
let app: Running;

beforeAll(async () => {
  app = await startApp(wizelens, (a) =>
    a.get("/boom", () => {
      throw new Error("kaboom");
    }),
  );
});

afterAll(async () => {
  await wizelens.shutdown();
  await app.close();
});

const rpc = async <T>(id: number, method: string, params: unknown): Promise<T> => {
  const res = await fetch(`${app.base}/_wizelens/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return (await res.json()) as T;
};

describe("MCP", () => {
  it("lists the read-only tools", async () => {
    const body = await rpc<{ result: { tools: { name: string }[] } }>(1, "tools/list", {});
    expect(body.result.tools.map((t) => t.name).sort()).toEqual(["find_n_plus_one", "find_slow_queries", "get_errors", "get_trace", "list_traces"]);
  });

  it("calls a tool and writes an audit line", async () => {
    await fetch(`${app.base}/boom`);
    await new Promise((r) => setTimeout(r, 20));
    const body = await rpc<{ result: { content: { text: string }[] } }>(2, "tools/call", { name: "get_errors", arguments: {} });
    expect(body.result.content[0]!.text).toContain("kaboom");
    expect(audit.some((l) => l.includes("tool=get_errors"))).toBe(true);
  });

  it("is off unless enabled", async () => {
    const off = createWizeLens({ serviceName: "no-mcp", enabled: true, storage: "memory" });
    const other = await startApp(off, () => {});
    expect((await fetch(`${other.base}/_wizelens/mcp`, { method: "POST", headers, body: "{}" })).status).toBe(404);
    await off.shutdown();
    await other.close();
  });
});
