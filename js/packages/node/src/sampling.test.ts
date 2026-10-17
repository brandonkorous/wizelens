import { describe, expect, it } from "vitest";
import type { LogRecord, Span } from "@wizeworks/lens-core";
import { samplingInfo, TraceSampler } from "./sampling.js";
import { TraceStore } from "./store.js";
import { fakeSpan } from "./test/helpers.js";

// The last 8 hex digits pick the trace: ...00000000 is always in a rate, ...ffffffff never is.
const IN = "a".repeat(24) + "00000000";
const OUT = "b".repeat(24) + "ffffffff";
const info = { rate: 0.5, keepErrors: true, keepSlowMs: 1000 };
const child = (traceId: string, extra: Partial<Span> = {}): Span => ({ ...fakeSpan(traceId, 0), parentSpanId: "c".repeat(16), kind: "internal", ...extra });
const log = (level: LogRecord["level"]): LogRecord => ({ timeMs: 0, level, category: "app", message: level, service: "s", spanId: null, attributes: {} });

function sampledStore(now = () => 0) {
  return new TraceStore({ sampler: new TraceSampler(info, now) });
}

describe("samplingInfo", () => {
  it("is null at the full rate and reads the variable", () => {
    expect(samplingInfo(undefined, undefined)).toBeNull();
    expect(samplingInfo({ rate: 1 }, undefined)).toBeNull();
    expect(samplingInfo(undefined, "0.2")).toEqual({ rate: 0.2, keepErrors: true, keepSlowMs: 1000 });
    expect(samplingInfo({ rate: 0.1, keepErrors: false, keepSlowMs: null }, "0.9")).toEqual({ rate: 0.1, keepErrors: false, keepSlowMs: null });
  });
});

describe("TraceSampler in the store", () => {
  it("keeps a trace inside the rate at once", () => {
    const store = sampledStore();
    store.addSpan(child(IN));
    expect(store.get(IN)!.spans).toHaveLength(1);
  });

  it("holds a trace outside the rate, then drops it when its root ends fine", () => {
    const store = sampledStore();
    store.addSpan(child(OUT));
    store.addLog(OUT, log("info"));
    store.addRemote(OUT, "http://x/_wizelens");
    expect(store.get(OUT)).toBeUndefined();
    store.addSpan(fakeSpan(OUT, 0));
    store.addSpan(child(OUT));
    expect(store.get(OUT)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("keeps the whole held trace when a span fails", () => {
    const store = sampledStore();
    store.addSpan(child(OUT));
    store.addLog(OUT, log("info"));
    store.addRemote(OUT, "http://x/_wizelens");
    store.addSpan({ ...fakeSpan(OUT, 0), status: "error" });
    const t = store.get(OUT)!;
    expect([t.spans.length, t.logs.length, t.remotes]).toEqual([2, 1, ["http://x/_wizelens"]]);
  });

  it("keeps a slow trace and a trace with an error log", () => {
    const store = sampledStore();
    store.addSpan({ ...fakeSpan(OUT, 0), durationMs: 1500 });
    expect(store.get(OUT)!.spans).toHaveLength(1);
    const other = "d".repeat(24) + "ffffffff";
    store.addSpan(child(other));
    store.addLog(other, log("error"));
    expect(store.get(other)!.spans).toHaveLength(1);
  });

});

describe("TraceSampler edge cases", () => {
  it("does not count a long browser span as slow", () => {
    const store = sampledStore();
    store.addSpan({ ...fakeSpan(OUT, 0), category: "browser", durationMs: 9000 });
    expect(store.get(OUT)).toBeUndefined();
  });

  it("drops a held trace whose root never ends after a minute", () => {
    let now = 0;
    const store = sampledStore(() => now);
    store.addSpan(child(OUT));
    now = 61_000;
    store.addSpan(child(OUT));
    store.addSpan({ ...fakeSpan(OUT, 0), status: "error" });
    expect(store.get(OUT)!.spans).toHaveLength(1);
  });
});
