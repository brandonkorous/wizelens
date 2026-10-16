import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { type LogRecord, newTraceId, type Span } from "@wizeworks/lens-core";
import { SqlitePersister, TraceStore } from "./index.js";
import { fakeSpan } from "./test/helpers.js";

function span(traceId: string, startMs: number, attributes: Span["attributes"] = {}): Span {
  return { ...fakeSpan(traceId, startMs, attributes), name: "GET /x", service: "svc", durationMs: 2 };
}

const log = (message: string, level: LogRecord["level"] = "info"): LogRecord => ({
  timeMs: Date.now(),
  level,
  category: "c",
  message,
  service: "svc",
  spanId: null,
  attributes: {},
});

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "wizelens-"));
  dirs.push(dir);
  return join(dir, "nested", "traces.db");
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function open(path: string, store: TraceStore, now?: () => number): SqlitePersister {
  const p = new SqlitePersister(store, { path, serviceName: "svc", now, warn: (m) => { throw new Error(m); } });
  expect(p.open()).toBe(true);
  return p;
}

function writeTwoTraces(path: string, t1: string, t2: string): void {
  const a = new TraceStore();
  const pa = open(path, a);
  a.addSpan(span(t1, Date.now() - 100, { "wizelens.browser.session": "tab-1" }));
  a.addLog(t1, log("first"));
  a.addRemote(t1, "http://other/_wizelens");
  pa.flush();
  a.addLog(t1, log("second", "warn"));
  a.addSpan(span(t2, Date.now()));
  pa.close();
}

function reloadAndAppend(path: string, t1: string, t2: string): void {
  const b = new TraceStore();
  const pb = open(path, b);
  const t = b.get(t1)!;
  expect(t.spanCount).toBe(1);
  expect(t.logs.map((l) => l.message)).toEqual(["first", "second"]);
  expect(t.remotes).toEqual(["http://other/_wizelens"]);
  expect(b.list().map((x) => x.traceId)).toEqual([t2, t1]);
  expect(b.list(50, "tab-1").map((x) => x.traceId)).toEqual([t1]);
  b.addLog(t1, log("third"));
  pb.close();
}

function roundTrips(): void {
  const path = tempFile();
  const t1 = newTraceId();
  const t2 = newTraceId();
  writeTwoTraces(path, t1, t2);
  reloadAndAppend(path, t1, t2);
  const c = new TraceStore();
  open(path, c).close();
  expect(c.get(t1)!.logs.map((l) => l.message)).toEqual(["first", "second", "third"]);
  const db = new DatabaseSync(path);
  expect(db.prepare("SELECT value FROM meta WHERE key = 'schema'").get()).toEqual({ value: "1" });
  expect(db.prepare("SELECT session FROM spans WHERE trace_id = ?").get(t1)).toEqual({ session: "tab-1" });
  db.close();
}

function prunes(): void {
  const path = tempFile();
  const now = Date.now();
  const a = new TraceStore({ maxTraces: 10 });
  const pa = open(path, a);
  const ids = Array.from({ length: 5 }, () => newTraceId());
  ids.forEach((id, i) => a.addSpan(span(id, now - 1000 + i)));
  a.addSpan(span(newTraceId(), now - 60_000));
  pa.close();
  const b = new TraceStore({ maxTraces: 3, maxAgeMs: 30_000 });
  open(path, b).close();
  expect(b.list().map((t) => t.traceId)).toEqual([ids[4], ids[3], ids[2]]);
  const db = new DatabaseSync(path);
  expect(db.prepare("SELECT count(*) AS n FROM traces").get()).toEqual({ n: 3 });
  expect(db.prepare("SELECT count(*) AS n FROM spans").get()).toEqual({ n: 3 });
  db.close();
}

function fallsBack(): void {
  const warnings: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "wizelens-"));
  dirs.push(dir);
  const p = new SqlitePersister(new TraceStore(), { path: dir, serviceName: "svc", warn: (m) => warnings.push(m) });
  expect(p.open()).toBe(false);
  expect(p.active).toBe(false);
  p.flush();
  expect(warnings).toHaveLength(1);
}

describe("SqlitePersister", () => {
  it("round-trips spans, logs, remotes, and sessions through the file", roundTrips);
  it("prunes the file by count and by age", prunes);
  it("falls back to memory with one warning when the file cannot be opened", fallsBack);
});
