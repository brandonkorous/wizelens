import { describe, expect, it } from "vitest";
import { busyMs, busyWithin, totalMs } from "./busy.js";
import { traceTiming } from "./health.js";
import { makeSpan } from "./testing/fixtures.js";

const at = (startMs: number, durationMs: number) => ({ startMs, durationMs });

describe("busyMs", () => {
  it("counts spans that run together once", () => {
    const spans = [at(0, 45), at(0, 45), at(0, 45), at(1, 44), at(1, 44)];
    expect(busyMs(spans)).toBe(45);
    expect(totalMs(spans)).toBe(223);
  });

  it("merges overlaps and skips gaps", () => {
    expect(busyMs([at(0, 10), at(5, 10), at(30, 5)])).toBe(20);
  });

  it("is zero for no spans", () => {
    expect(busyMs([])).toBe(0);
  });
});

describe("traceTiming with queries that run together", () => {
  it("never reports more database time than server time", () => {
    const server = makeSpan({ category: "http.server", kind: "server", service: "api", startMs: 0, durationMs: 64 });
    const db = [0, 0, 0, 0, 0].map(() => makeSpan({ category: "db", service: "api", startMs: 9, durationMs: 44.6 }));
    const t = traceTiming({ spans: [server, ...db], durationMs: 64 });
    expect(t.dbMs).toBeCloseTo(44.6);
    expect(t.dbTotalMs).toBeCloseTo(223);
    expect(t.server).toMatchObject({ dbMs: 44.6, codeMs: 64 - 44.6 });
  });
});

describe("work after an aborted request", () => {
  it("does not count toward the server's own time", () => {
    const server = makeSpan({ category: "http.server", kind: "server", service: "api", startMs: 0, durationMs: 100 });
    const inside = makeSpan({ category: "db", service: "api", startMs: 10, durationMs: 50 });
    const after = makeSpan({ category: "db", service: "api", startMs: 90, durationMs: 60 });
    const t = traceTiming({ spans: [server, inside, after], durationMs: 150 });
    expect(t.server).toMatchObject({ dbMs: 60, codeMs: 40 });
    expect(busyWithin([after], 0, 100)).toBe(10);
  });
});
