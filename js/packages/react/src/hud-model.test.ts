import { describe, expect, it } from "vitest";
import { currentRequest, ERROR_HOLD_MS, fmtMs, pct, requestView } from "./hud-model.js";
import type { RecordedRequest, ServerStats } from "./recorder.js";

const server = (over: Partial<ServerStats> = {}): ServerStats => ({
  name: "GET /api/orders",
  durationMs: 186,
  dbCount: 4,
  dbMs: 92,
  dbTotalMs: 92,
  dbSlowestMs: 48,
  dbDurations: [48, 20, 14, 10],
  httpClientCount: 2,
  errorCount: 0,
  insights: 1,
  parts: { codeMs: 50, dbMs: 92, httpOutMs: 44, httpOutCount: 2 },
  services: ["api"],
  ...over,
});

const req = (over: Partial<RecordedRequest> = {}): RecordedRequest => ({
  id: "s1",
  method: "GET",
  url: "http://app.test/api/orders/1284",
  path: "/api/orders/1284",
  status: 200,
  durationMs: 243,
  renderMs: 41,
  traceId: "t1",
  profiled: true,
  startMs: 1000,
  error: null,
  server: server(),
  ...over,
});

describe("requestView", () => {
  it("is neutral without a request", () => {
    expect(requestView(null)).toMatchObject({ health: "neutral", totalMs: null, segments: null });
  });

  it("adds render time to the round trip and splits the bar", () => {
    const v = requestView(req());
    expect(v).toMatchObject({ health: "opportunity", totalMs: 284, serverMs: 186, dbMs: 92, renderMs: 41, sql: 4, fetch: 2, insights: 1 });
    expect(v.segments).toEqual({ server: 94, db: 92, render: 41, other: 57 });
  });

  it("follows the brand states", () => {
    expect(requestView(req({ server: server({ insights: 0 }) })).health).toBe("success");
    expect(requestView(req({ durationMs: 640 })).health).toBe("warning");
    expect(requestView(req({ status: 500 })).health).toBe("critical");
    expect(requestView(req({ server: server({ errorCount: 1 }) }))).toMatchObject({ health: "critical", errors: 1 });
    expect(requestView(req({ server: undefined })).health).toBe("info");
    expect(requestView(req({ durationMs: null, status: null })).health).toBe("info");
    // Not profiled: nothing to find on the server, so a fast call is a success.
    expect(requestView(req({ profiled: false, server: undefined }))).toMatchObject({ health: "success", sql: 0, insights: 0 });
  });

  it("uses the slow threshold", () => {
    expect(requestView(req({ server: server({ insights: 0 }) }), 200).health).toBe("warning");
  });
});

describe("currentRequest", () => {
  const running = req({ id: "new", durationMs: null, status: null });
  const done = req({ id: "old" });
  const older = req({ id: "older" });

  it("shows the newest finished request while live", () => {
    expect(currentRequest([running, done, older], true, "older")?.id).toBe("old");
    expect(currentRequest([running], true, null)?.id).toBe("new");
    expect(currentRequest([], true, null)).toBeNull();
  });

  it("holds a fresh failure so newer background requests do not hide it", () => {
    const failedAt = req({ id: "401", status: 401, startMs: 1000, durationMs: 20 });
    const poll = req({ id: "poll", startMs: 1100, durationMs: 10 });
    expect(currentRequest([poll, failedAt], true, null, 1200)?.id).toBe("401");
    expect(currentRequest([poll, failedAt], true, null, 1020 + ERROR_HOLD_MS)?.id).toBe("poll");
    expect(currentRequest([poll, { ...failedAt, restored: true }], true, null, 1200)?.id).toBe("poll");
  });

  it("shows the pinned request while paused", () => {
    expect(currentRequest([running, done, older], false, "older")?.id).toBe("older");
    expect(currentRequest([running, done], false, "gone")?.id).toBe("old");
  });
});

describe("format", () => {
  it("formats ms like the mockups", () => {
    expect(fmtMs(null)).toBe("—");
    expect(fmtMs(0)).toBe("0 ms");
    expect(fmtMs(4.25)).toBe("4.3 ms");
    expect(fmtMs(284.4)).toBe("284 ms");
    expect(fmtMs(1842)).toBe("1,842 ms");
    expect(fmtMs(12_400)).toBe("12.4 s");
    expect(pct(186, 284)).toBe("65%");
    expect(pct(null, 284)).toBe("");
  });
});
