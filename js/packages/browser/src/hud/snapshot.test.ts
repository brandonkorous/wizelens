import { expect, it } from "vitest";
import { ERROR_HOLD_MS } from "../hud-model.js";
import { span } from "../test-env.js";
import { row, serverStats } from "../test-hud.js";
import { holdDelay, hudSnapshot, pinOf, restoredIdOf } from "./snapshot.js";
import { ticksFor, waterfallRows } from "./waterfall.js";

const LIVE = { panel: "", live: true, minimized: false } as const;

it("shows the newest finished request, and marks the HUD busy while one runs", () => {
  const running = row({ id: "s3", durationMs: null, status: null });
  const done = row({ id: "s2" });
  const snap = hudSnapshot([running, done], LIVE, null, 500);
  expect(snap.req?.id).toBe("s2");
  expect(snap.busy).toBe(true);
  expect(hudSnapshot([done], LIVE, null, 500).busy).toBe(false);
});

it("holds a fresh failure over newer requests until ERROR_HOLD_MS ends", () => {
  const failed = row({ id: "s1", status: 500, startMs: 1000, durationMs: 100 });
  const newer = row({ id: "s2", startMs: 1200 });
  const at = 1100 + ERROR_HOLD_MS - 1;
  expect(hudSnapshot([newer, failed], LIVE, null, 500, at)).toMatchObject({ req: { id: "s1" }, held: { id: "s1" } });
  expect(hudSnapshot([newer, failed], LIVE, null, 500, at + 2)).toMatchObject({ req: { id: "s2" }, held: null });
  expect(holdDelay(failed, 1100)).toBe(ERROR_HOLD_MS + 20);
  expect(holdDelay(failed, 1100 + ERROR_HOLD_MS * 2)).toBe(20);
});

it("stays on the pinned request while paused", () => {
  const older = row({ id: "s1" });
  const newer = row({ id: "s2" });
  const paused = { ...LIVE, live: false };
  expect(hudSnapshot([newer, older], paused, "s1", 500).req?.id).toBe("s1");
  expect(hudSnapshot([newer, older], LIVE, "s1", 500).req?.id).toBe("s2");
  expect(pinOf(hudSnapshot([newer, older], LIVE, null, 500))).toBe("s2");
});

it("loads full stats only for a restored row that has summary counts", () => {
  expect(restoredIdOf(row({ restored: true, traceId: "t9", server: serverStats({ insights: null }) }))).toBe("t9");
  expect(restoredIdOf(row({ restored: true, traceId: "t9" }))).toBe("t9");
  expect(restoredIdOf(row({ restored: true, server: serverStats({ insights: 2 }) }))).toBeNull();
  expect(restoredIdOf(row())).toBeNull();
  expect(restoredIdOf(null)).toBeNull();
});

it("builds timeline rows: the browser call, spans with queries grouped, then the render", () => {
  const req = row({ startMs: 0, durationMs: 200, renderMs: 30, path: "/api/orders" });
  const trace = {
    traceId: "t",
    spans: [
      span("10", "http.server", "api", 150),
      span("20", "db", "api", 10, { parentSpanId: "10" }),
      span("40", "db", "api", 20, { parentSpanId: "10", status: "error" }),
    ],
  };
  const rows = waterfallRows(req, trace as never);
  expect(rows.map((r) => [r.key, r.kind, r.depth])).toEqual([
    ["browser", "browser", 0],
    ["10", "server", 0],
    ["db:10", "error", 1],
    ["render", "render", 0],
  ]);
  expect(rows[2]).toMatchObject({ name: "api – 2 queries", durationMs: 30, barMs: 40 });
  expect(rows[3]).toMatchObject({ startMs: 200, durationMs: 30 });
});

it("puts round ticks on the time axis", () => {
  expect(ticksFor(1000)).toEqual([0, 500, 1000]);
  expect(ticksFor(800)).toEqual([0, 200, 400, 600, 800]);
  expect(ticksFor(90)).toEqual([0, 50]);
});
