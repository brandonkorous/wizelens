import { describe, expect, it } from "vitest";
import { type ClientLog, formatConsole, watchConsole } from "./console-capture.js";
import { createSender } from "./sender.js";

const VIEW = { traceId: "a".repeat(32), spanId: "b".repeat(16), route: "/", url: "http://localhost/" };

describe("browser console capture", () => {
  it("formats like the console", () => {
    expect(formatConsole(["%cWizeLens%c ready in %dms", "color:red", "", 12.7, { a: 1 }])).toBe('WizeLens ready in 12ms {"a":1}');
    expect(formatConsole([new Error("boom"), 100])).toBe("Error: boom 100");
    expect(formatConsole(["100%% done"])).toBe("100% done");
  });

  it("copies calls into the page view and restores the console", () => {
    const before = console.warn;
    const seen: ClientLog[] = [];
    const stop = watchConsole(() => VIEW, (l) => seen.push(l));
    console.warn("low %s", "stock");
    stop();
    expect(console.warn).toBe(before);
    expect(seen).toMatchObject([{ traceId: VIEW.traceId, spanId: VIEW.spanId, level: "warn", category: "console", message: "low stock", service: "browser" }]);
  });

  it("sends logs with the spans", async () => {
    const bodies: unknown[] = [];
    const fake = (async (_u: string, init: RequestInit) => void bodies.push(JSON.parse(String(init.body)))) as unknown as typeof fetch;
    const sender = createSender("http://localhost/_wizelens", () => fake);
    sender.log({ traceId: VIEW.traceId, spanId: null, timeMs: 1, level: "info", category: "console", message: "hi", service: "browser", attributes: {} });
    await sender.flush();
    expect(bodies).toEqual([{ spans: [], logs: [expect.objectContaining({ message: "hi" })], sentAt: expect.any(Number) }]);
  });
});
