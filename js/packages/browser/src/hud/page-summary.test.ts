import { describe, expect, it } from "vitest";
import { row, serverStats } from "../test-hud.js";
import { MAX_CALLS, PageLog } from "./page-log.js";
import { addUp, ROUTE_LOAD_MS, summarizePage } from "./page-summary.js";
import { callName, pageRows, splitName, ticksFor } from "./waterfall.js";

const call = (id: string, startMs: number, over = {}) => row({ id, startMs, durationMs: 100, renderMs: 0, traceId: `t-${id}`, path: `/api/${id}`, server: serverStats({ insights: 0 }), ...over });
const noLoad = () => null;

describe("PageLog", () => {
  it("puts each call on the page it started on, and keeps the page's own request", () => {
    const log = new PageLog("http://app.test/orders?tab=1", 0);
    log.take([call("a", 10), row({ id: "document-t0", startMs: 0 }), call("old", 5, { restored: true })]);
    expect(log.navigate("http://app.test/orders?tab=2", 50)).toBeNull();
    const spa = log.navigate("http://app.test/cart", 100)!;
    log.take([call("b", 120), call("a", 10, { status: 500 })]);
    const load = log.find(1)!;
    expect([...load.calls.keys()]).toEqual(["a"]);
    expect(load.calls.get("a")!.status).toBe(500);
    expect(load.doc?.id).toBe("document-t0");
    expect([...spa.calls.keys()]).toEqual(["b"]);
    expect(log.current).toBe(spa);
    expect(spa.path).toBe("/cart");
  });

  it("drops the oldest calls past MAX_CALLS, and counts them", () => {
    const log = new PageLog("http://app.test/", 0);
    for (let i = 0; i <= MAX_CALLS; i++) log.take([call(`c${i}`, 1 + i)]);
    expect(log.current.calls.size).toBe(MAX_CALLS);
    expect(log.current.dropped).toBe(1);
    expect(summarizePage(log.current, noLoad, 500).view.fetch).toBe(MAX_CALLS + 1);
  });
});

describe("summarizePage", () => {
  it("adds up server stats, and keeps the page's load time as Total", () => {
    const log = new PageLog("http://app.test/orders", 0);
    log.take([call("a", 10, { server: serverStats({ insights: 2, dbSlowestMs: 80 }) }), call("b", 20), row({ id: "document-t0", startMs: 0, durationMs: 120, renderMs: 60 })]);
    const snap = summarizePage(log.current, noLoad, 500);
    expect(snap.req).toMatchObject({ method: "GET", path: "/orders", status: 200, traceId: "t1", profiled: true });
    expect(snap.view).toMatchObject({ totalMs: 180, renderMs: 60, serverMs: 186 * 2, dbMs: 92 * 2, sql: 8, fetch: 2, insights: 2, errors: 0 });
    expect(snap.req.server).toMatchObject({ dbSlowestMs: 80, httpClientCount: 4 });
    expect(snap.calls.map((r) => r.id)).toEqual(["document-t0", "a", "b"]);
    const s = snap.view.segments!;
    expect(s.server + s.db + s.render + s.other).toBeCloseTo(180);
  });

  it("shows the page's own status unless a call failed", () => {
    const log = new PageLog("http://app.test/dashboard", 0);
    log.take([row({ id: "document-t0", startMs: 0, durationMs: 120, renderMs: 60 }), call("made", 10, { status: 201 })]);
    expect(summarizePage(log.current, noLoad, 500).req.status).toBe(200);
    log.take([call("broke", 20, { status: 502 }), call("missing", 30, { status: 404 })]);
    expect(summarizePage(log.current, noLoad, 500).req.status).toBe(502);
  });

  it("times a route change by the calls that loaded it, and takes the worst health", () => {
    const log = new PageLog("http://app.test/", 0);
    log.take([call("poll", 100, { path: "/api/status?x=1" }), call("poll2", 400, { path: "/api/status?x=2" })]);
    const page = log.navigate("http://app.test/cart", 1000)!;
    log.take([call("a", 1010), call("late", 1000 + ROUTE_LOAD_MS + 1, { durationMs: 900 }), call("poll3", 1500, { path: "/api/status" })]);
    page.renderMs = 40;
    const snap = summarizePage(page, noLoad, 500);
    expect(snap.view.totalMs).toBe(110);
    expect(snap.view.health).toBe("warning");
    expect(snap.lead).toBeNull();
  });

  it("waits for server stats before it counts queries and insights", () => {
    const log = new PageLog("http://app.test/", 0);
    log.take([call("a", 10, { server: undefined })]);
    expect(summarizePage(log.current, noLoad, 500).view).toMatchObject({ sql: null, insights: null, fetch: 1 });
    expect(addUp([row({ server: undefined })])).toBeUndefined();
  });
});

describe("pageRows", () => {
  it("lists the page's request, its first paint, and each call with its queries and trace link", () => {
    const lead = row({ id: "document-t0", path: "/orders", startMs: 0, durationMs: 100, renderMs: 30, server: undefined });
    const failed = call("b", 50, { status: 500 });
    const rows = pageRows([lead, failed], lead, null, (r) => `#/traces/${r.traceId}`);
    expect(rows.map((r) => [r.name, r.kind, r.href ?? null])).toEqual([
      ["GET /orders (page)", "browser", "#/traces/t1"],
      ["First paint", "render", null],
      ["GET /api/orders · 4 SQL", "error", "#/traces/t-b"],
    ]);
    expect(pageRows([], null, { startMs: 0, renderMs: 25 }, () => null)[0]).toMatchObject({ name: "Route render", durationMs: 25 });
  });

  it("names a call by its server route, else by its path with another origin's host last", () => {
    const api = "http://localhost:3001/api/v1/boards/c2be23b0-868c-407f-bd45-adc4592e8a7a/members";
    expect(callName(call("m", 0, { path: api, server: serverStats({ name: "GET /api/v1/boards/:id/members" }) }))).toBe("GET /api/v1/boards/:id/members");
    expect(callName(call("m", 0, { path: api, server: undefined }))).toBe("GET /api/v1/boards/c2be23b0-868c-407f-bd45-adc4592e8a7a/members · localhost:3001");
    expect(callName(call("o", 0, { path: "/orders?tab=2", server: undefined }))).toBe("GET /orders?tab=2");
  });

  it("splits a name into method, middle and last path segment, so a cut keeps both ends", () => {
    expect(splitName("GET /api/v1/boards/:boardId/members · 6 SQL")).toEqual(["GET ", "/api/v1/boards/:boardId", "/members · 6 SQL"]);
    expect(splitName("POST /a/b · localhost:3001 · 2 SQL")).toEqual(["POST ", "/a", "/b · localhost:3001 · 2 SQL"]);
    expect(splitName("GET /orders (page)")).toEqual(["GET ", "", "/orders (page)"]);
    expect(splitName("Route render")).toEqual(["", "Route render", ""]);
  });

  it("puts round ticks on the time axis", () => {
    expect(ticksFor(1000)).toEqual([0, 500, 1000]);
    expect(ticksFor(800)).toEqual([0, 200, 400, 600, 800]);
    expect(ticksFor(90)).toEqual([0, 50]);
  });
});
