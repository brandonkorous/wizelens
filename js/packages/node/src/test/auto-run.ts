import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import type { HubLog, HubSender, IngestBatch, Span } from "@wizeworks/lens-core/internal";

/** The built auto entry. Tests run after `pnpm build`, like CI. */
export const AUTO_ENTRY = new URL("../../dist/auto.js", import.meta.url).href;

const fixture = (name: string) => fileURLToPath(new URL(`../auto/fixtures/${name}`, import.meta.url));

/** A stand-in hub that keeps every batch the add-on sends. */
export interface FakeHub {
  url: string;
  spans: Span[];
  logs: HubLog[];
  senders: HubSender[];
  close(): Promise<void>;
}

export async function fakeHub(): Promise<FakeHub> {
  const hub: Omit<FakeHub, "url" | "close"> = { spans: [], logs: [], senders: [] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      if (req.url === "/_wizelens/api/ingest" && body) {
        const batch = JSON.parse(body) as IngestBatch;
        hub.senders.push(batch.sender);
        hub.spans.push(...(batch.spans ?? []));
        hub.logs.push(...(batch.logs ?? []));
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { ...hub, url, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

/** A fixture app started with `--import @wizeworks/lens-node/auto`. It prints "ready <port>" once it listens. */
export interface AutoApp {
  port: number;
  output(): string;
  get(path: string): Promise<Response>;
  stop(): Promise<void>;
}

export function runApp(name: string, env: Record<string, string>, entry = AUTO_ENTRY): Promise<AutoApp> {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", entry, fixture(name)], {
    env: { ...process.env, NODE_ENV: "development", WIZELENS_DASHBOARD: "false", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout!.on("data", (d: Buffer) => (output += d.toString()));
  child.stderr!.on("data", (d: Buffer) => (output += d.toString()));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} did not start:\n${output}`)), 15_000);
    child.stdout!.on("data", () => {
      const port = /ready (\d+)/.exec(output)?.[1];
      if (!port) return;
      clearTimeout(timer);
      resolve(appOf(child, Number(port), () => output));
    });
    child.once("exit", (code) => reject(new Error(`${name} exited with ${code}:\n${output}`)));
  });
}

function appOf(child: ChildProcess, port: number, output: () => string): AutoApp {
  return {
    port,
    output,
    get: (path) => fetch(`http://127.0.0.1:${port}${path}`),
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill();
      }),
  };
}

/** Wait until `check` passes, for the hub sender's one-second batches. */
export async function eventually(check: () => boolean, ms = 8000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}
