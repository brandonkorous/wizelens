import { afterAll, expect, it } from "vitest";
import { newSpanId, newTraceId } from "@wizeworks/lens-core";
import { browserClockOffset } from "./client-spans.js";
import { type Running, startApp } from "./test/helpers.js";
import { createWizeLens } from "./wizelens.js";

// A crawler's clock put its page view 4.6 hours before the server request, so the request read as 4.6 hours long.

const wl = createWizeLens({ service: "web", storage: "memory", instrumentFetch: false });
const app: Running = await startApp(wl, () => {});
afterAll(() => app.close());

const HOURS = 16_560_000; // 4.6 hours

async function post(body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${app.base}/_wizelens/api/client-spans`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(res.status).toBe(204);
}

it("moves a browser's spans, events, and logs onto the server's clock", async () => {
  const traceId = newTraceId();
  const spanId = newSpanId();
  const browserNow = Date.now() - HOURS;
  await post({
    sentAt: browserNow,
    spans: [{ traceId, spanId, name: "react renders /pricing", category: "browser", startMs: browserNow - 2000, durationMs: 1500, events: [{ name: "click", timeMs: browserNow - 1000 }] }],
    logs: [{ traceId, spanId, level: "info", message: "hi", timeMs: browserNow - 500 }],
  });
  const t = wl.store.get(traceId)!;
  const span = t.spans[0]!;
  expect(Math.abs(span.startMs - (Date.now() - 2000))).toBeLessThan(5000);
  expect(span.durationMs).toBe(1500);
  expect(span.events[0]!.timeMs - span.startMs).toBe(1000);
  expect(t.logs[0]!.timeMs - span.startMs).toBe(1500);
});

it("leaves the times of a browser that sent no clock", async () => {
  const traceId = newTraceId();
  const startMs = Date.now() - HOURS;
  await post({ spans: [{ traceId, spanId: newSpanId(), name: "pageview /", category: "browser", startMs, durationMs: 10 }] });
  expect(wl.store.get(traceId)!.spans[0]!.startMs).toBe(startMs);
});

it("treats a small gap as network time, not a wrong clock", () => {
  expect(browserClockOffset(1_000_000, 1_003_000)).toBe(0);
  expect(browserClockOffset(1_000_000, 1_000_000 + HOURS)).toBe(HOURS);
  expect(browserClockOffset(1_000_000 + HOURS, 1_000_000)).toBe(-HOURS);
  expect(browserClockOffset(undefined, 1_000_000)).toBe(0);
  expect(browserClockOffset("soon", 1_000_000)).toBe(0);
});
