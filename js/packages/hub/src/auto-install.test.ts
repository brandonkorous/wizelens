import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import type { Hub } from "./hub.js";
import { startHub } from "./test/helpers.js";

// samples/auto-node has no WizeLens code. The auto install, through --import, sends its traces to this hub.
const SAMPLE = fileURLToPath(new URL("../../../../samples/auto-node/", import.meta.url));
const AUTO = import.meta.resolve("@wizeworks/lens-node/auto");

let hub: Hub | undefined;
let app: ChildProcess | undefined;
afterEach(() => {
  app?.kill();
  hub?.close();
});

function startSample(hubUrl: string): Promise<string> {
  app = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", AUTO, "src/server.mjs"], {
    cwd: SAMPLE,
    env: { ...process.env, NODE_ENV: "development", WIZELENS_ENDPOINT: hubUrl, WIZELENS_DASHBOARD: "false", PORT: "0" },
  });
  let output = "";
  return new Promise((resolve, reject) => {
    app!.stdout!.on("data", (d: Buffer) => {
      output += d.toString();
      const url = /listening on (http:\/\/\S+)/.exec(output)?.[1];
      if (url) resolve(url);
    });
    app!.stderr!.on("data", (d: Buffer) => (output += d.toString()));
    app!.once("exit", (code) => reject(new Error(`sample exited with ${code}: ${output}`)));
  });
}

async function hubTrace(url: string, traceId: string): Promise<{ spans: { name: string; service: string; kind: string }[] }> {
  for (let i = 0; i < 80; i++) {
    const res = await fetch(`${url}/_wizelens/api/traces/${traceId}`);
    if (res.ok) {
      const trace = (await res.json()) as { spans: { name: string; service: string; kind: string }[] };
      if (trace.spans.some((s) => s.kind === "server")) return trace;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`trace ${traceId} never reached the hub`);
}

it("a Node app with no WizeLens code, started with --import @wizeworks/lens-node/auto, sends its traces to the hub", { timeout: 30_000 }, async () => {
  let url: string;
  ({ hub, url } = await startHub());
  const sample = await startSample(url);
  const res = await fetch(`${sample}/api/products/1/related`);
  expect(res.status).toBe(200);
  const traceId = res.headers.get("x-wizelens-trace")!;
  expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  const trace = await hubTrace(url, traceId);
  expect(trace.spans.find((s) => s.kind === "server")).toMatchObject({ name: "GET /api/products/:id/related", service: "sample-auto-node" });
  expect(trace.spans.filter((s) => s.name === "SELECT products")).toHaveLength(4);
  const services = (await (await fetch(`${url}/_wizelens/api/services`)).json()) as { services: { service: string; runtime?: string }[] };
  expect(services.services).toContainEqual(expect.objectContaining({ service: "sample-auto-node", runtime: expect.stringContaining("node") }));
});
