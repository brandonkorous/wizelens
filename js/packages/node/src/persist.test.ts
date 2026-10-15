import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { newSpanId, newTraceId, type Span } from "@wizeworks/lens-core";
import { SqlitePersister, TraceStore } from "./index.js";

function span(traceId: string, startMs: number, attributes: Span["attributes"] = {}): Span {
  return {
    traceId,
    spanId: newSpanId(),
    parentSpanId: null,
    name: "GET /x",
    kind: "server",
    category: "http.server",
    service: "svc",
    startMs,
    durationMs: 2,
    status: "unset",
    statusMessage: null,
    attributes,
    events: [],
  };
}

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

describe("SqlitePersister", () => {
  it("round-trips spans, logs, remotes, and sessions through the file", () => {
    const path = tempFile();
    const t1 = newTraceId();
    const t2 = newTraceId();
    const a = new TraceStore();
    const pa = open(path, a);
    a.addSpan(span(t1, Date.now() - 100, { "wizelens.browser.session": "tab-1" }));
    a.addLog(t1, { timeMs: Date.now(), level: "info", category: "c", message: "first", service: "svc", spanId: null, attributes: {} });
    a.addRemote(t1, "http://other/_wizelens");
    pa.flush();
    // A second flush only writes what changed.
    a.addLog(t1, { timeMs: Date.now(), level: "warn", category: "c", message: "second", service: "svc", spanId: null, attributes: {} });
    a.addSpan(span(t2, Date.now()));
    pa.close();

    const b = new TraceStore();
    const pb = open(path, b);
    const t = b.get(t1)!;
    expect(t.spanCount).toBe(1);
    expect(t.logs.map((l) => l.message)).toEqual(["first", "second"]);
    expect(t.remotes).toEqual(["http://other/_wizelens"]);
    expect(b.list().map((x) => x.traceId)).toEqual([t2, t1]);
    expect(b.list(50, "tab-1").map((x) => x.traceId)).toEqual([t1]);

    // New logs on a loaded trace continue the sequence instead of overwriting.
    b.addLog(t1, { timeMs: Date.now(), level: "info", category: "c", message: "third", service: "svc", spanId: null, attributes: {} });
    pb.close();
    const c = new TraceStore();
    open(path, c).close();
    expect(c.get(t1)!.logs.map((l) => l.message)).toEqual(["first", "second", "third"]);

    const db = new DatabaseSync(path);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'schema'").get()).toEqual({ value: "1" });
    expect(db.prepare("SELECT session FROM spans WHERE trace_id = ?").get(t1)).toEqual({ session: "tab-1" });
    db.close();
  });

  it("prunes the file by count and by age", () => {
    const path = tempFile();
    const now = Date.now();
    const a = new TraceStore({ maxTraces: 10 });
    const pa = open(path, a);
    const ids = Array.from({ length: 5 }, () => newTraceId());
    ids.forEach((id, i) => a.addSpan(span(id, now - 1000 + i)));
    const old = newTraceId();
    a.addSpan(span(old, now - 60_000));
    pa.close();

    // Restart with tighter limits: keep 3, max age 30 s.
    const b = new TraceStore({ maxTraces: 3, maxAgeMs: 30_000 });
    open(path, b).close();
    expect(b.list().map((t) => t.traceId)).toEqual([ids[4], ids[3], ids[2]]);

    const db = new DatabaseSync(path);
    expect(db.prepare("SELECT count(*) AS n FROM traces").get()).toEqual({ n: 3 });
    expect(db.prepare("SELECT count(*) AS n FROM spans").get()).toEqual({ n: 3 });
    db.close();
  });

  it("falls back to memory with one warning when the file cannot be opened", () => {
    const warnings: string[] = [];
    const dir = mkdtempSync(join(tmpdir(), "wizelens-"));
    dirs.push(dir);
    // A directory where the file should be: SQLite cannot open it.
    const p = new SqlitePersister(new TraceStore(), { path: dir, serviceName: "svc", warn: (m) => warnings.push(m) });
    expect(p.open()).toBe(false);
    expect(p.active).toBe(false);
    p.flush();
    expect(warnings).toHaveLength(1);
  });
});
