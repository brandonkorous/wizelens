import { afterEach, expect, it, vi } from "vitest";
import { Changes } from "./changes.js";
import type { Cloud } from "./server.js";
import { Client, setupOwner, startCloud } from "./test/cloud.js";

let cloud: Cloud | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await cloud?.close();
  cloud = undefined;
});

it("announces a project at once, then merges close calls into one later", () => {
  vi.useFakeTimers();
  const changes = new Changes();
  const seen: string[] = [];
  const any: string[] = [];
  changes.onAny((p) => any.push(p));
  const stop = changes.subscribe("a", () => seen.push("a"));
  changes.subscribe("b", () => seen.push("b"));
  changes.emit("a", Date.now());
  changes.emit("a", Date.now());
  changes.emit("a", Date.now());
  expect(seen).toEqual(["a"]);
  vi.advanceTimersByTime(2_000);
  expect(seen).toEqual(["a", "a"]);
  stop();
  changes.emit("a", Date.now() + 10_000);
  expect(seen).toEqual(["a", "a"]);
  expect(any).toEqual(["a", "a", "a"]);
  expect(changes.count("a")).toBe(0);
  expect(changes.count("b")).toBe(1);
});

/** Read a stream until `text` shows up, for at most 5 s. */
async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string): Promise<string> {
  let got = "";
  const end = Date.now() + 5_000;
  while (!got.includes(text) && Date.now() < end) got += new TextDecoder().decode((await reader.read()).value);
  return got;
}

it("streams new data to a signed-in reader of the project, and nobody else", async () => {
  let url: string;
  ({ cloud, url } = await startCloud());
  const { owner, projectId } = await setupOwner(cloud, url);
  expect((await new Client(url).call("GET", `api/changes?project=${projectId}`)).status).toBe(401);
  const ctl = new AbortController();
  const res = await fetch(`${url}/_wizelens/api/changes?project=${projectId}`, { headers: { Cookie: owner.cookie }, signal: ctl.signal });
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const reader = res.body!.getReader();
  expect(await readUntil(reader, "retry:")).toContain("retry: 5000");
  for (let i = 0; i < 50 && cloud.app.changes.count(projectId) === 0; i++) await new Promise((r) => setTimeout(r, 20));
  cloud.app.changes.emit(projectId);
  expect(await readUntil(reader, "event: data")).toContain("event: data");
  ctl.abort();
  for (let i = 0; i < 50 && cloud.app.changes.count(projectId) > 0; i++) await new Promise((r) => setTimeout(r, 20));
  expect(cloud.app.changes.count(projectId)).toBe(0);
});
