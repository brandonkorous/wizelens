import { describe, expect, it } from "vitest";
import { criticalPath, selfTimes } from "./span-time.js";
import { makeSpan } from "./testing/fixtures.js";
import { buildTrace } from "./trace.js";

const span = (spanId: string, parentSpanId: string | null, startMs: number, durationMs: number) => makeSpan({ traceId: "t", spanId, parentSpanId, startMs, durationMs, category: "internal" });

// root 0–100; a 10–40 and b 30–60 overlap (30–60 covered once more); c 70–95 ends last; c1 72–80 inside c.
const trace = buildTrace("t", [span("root", null, 0, 100), span("a", "root", 10, 30), span("b", "root", 30, 30), span("c", "root", 70, 25), span("c1", "c", 72, 8)], [], []);

describe("span time", () => {
  it("counts self time with overlapping children once", () => {
    const self = selfTimes(trace);
    expect(self.get("root")).toBe(100 - 50 - 25);
    expect(self.get("c")).toBe(25 - 8);
    expect(self.get("a")).toBe(30);
  });

  it("follows the child that ends last", () => {
    expect([...criticalPath(trace)]).toEqual(["root", "c", "c1"]);
  });
});
