import { describe, expect, it } from "vitest";
import { runPageSync } from "../models/index.js";
import { memoryExecutor } from "../scale/memory.js";
import { pageContext } from "../scale/run.js";
import { traceFacts } from "../scale/facts.js";
import { errorEvents } from "../stats/errors.js";
import { requestOf } from "../stats/requests.js";
import { serviceRows } from "../stats/services.js";
import type { Span } from "../types.js";
import { SCENARIO_NOW, scenarioTraces } from "../testing/scenario.js";
import { buildTrace } from "../trace.js";
import type { UptimeCheck } from "./check.js";
import { parseCheckInput, shownHeaders, statusMatches } from "./input.js";
import { dailyUptime, uptimeOver, uptimeWindows } from "./percent.js";
import { uptimeTelemetry } from "./span.js";
import { changeOf } from "./state.js";

const HOUR = 3_600_000;
const check: UptimeCheck = {
  id: "ck1", name: "Home", url: "https://example.com/health?key=abc", method: "GET", headers: {}, expectStatus: "200-299", expectBody: "", intervalMin: 1,
  timeoutMs: 5000, env: "", enabled: true, createdMs: 0, state: "up", lastRunMs: 0, lastDurationMs: 10, lastStatus: 200, lastError: null, tlsExpiresMs: null,
};

describe("check input", () => {
  it("fills defaults and refuses bad values", () => {
    const ok = parseCheckInput({ url: "https://example.com" });
    expect(ok).toMatchObject({ ok: true, input: { name: "example.com", method: "GET", expectStatus: "200-299", intervalMin: 5, timeoutMs: 10000 } });
    expect(parseCheckInput({ url: "ftp://x" })).toMatchObject({ ok: false });
    expect(parseCheckInput({ url: "https://u:p@x.com" })).toMatchObject({ ok: false, error: /credentials/ });
    expect(parseCheckInput({ url: "https://x.com", intervalMin: 61 })).toMatchObject({ ok: false });
    expect(parseCheckInput({ url: "https://x.com", expectStatus: "2xx" })).toMatchObject({ ok: false });
    expect(parseCheckInput({ url: "https://x.com", headers: { "Bad Name": "v" } })).toMatchObject({ ok: false });
  });

  it("keeps a hidden header value on change, and hides secrets when shown", () => {
    const current = { ...check, headers: { Authorization: "Bearer s3cret", Accept: "text/html" } };
    const shown = shownHeaders(current.headers);
    expect(shown).toEqual({ Authorization: "[redacted]", Accept: "text/html" });
    const next = parseCheckInput({ headers: shown, intervalMin: 2 }, current);
    expect(next).toMatchObject({ ok: true, input: { headers: { Authorization: "Bearer s3cret" }, intervalMin: 2 } });
  });

  it("matches status lists and ranges", () => {
    expect(statusMatches("200,301-302", 302)).toBe(true);
    expect(statusMatches("200,301-302", 404)).toBe(false);
  });
});

describe("uptime percent", () => {
  it("counts down time from incidents, open ones until now", () => {
    const now = 48 * HOUR;
    const incidents = [{ id: "i1", checkId: "ck1", startMs: 47 * HOUR, endMs: null, reason: "x" }];
    expect(uptimeOver(check, incidents, now - 24 * HOUR, now, now)).toBeCloseTo(100 - 100 / 24);
    expect(uptimeWindows({ createdMs: 24 * HOUR, lastRunMs: now }, incidents, now)["30d"]).toBeCloseTo(100 - 100 / 24);
    expect(uptimeOver({ createdMs: 0, lastRunMs: null }, [], 0, now, now)).toBeNull();
    expect(dailyUptime(check, incidents, 2, now + 2 * HOUR)).toEqual([100 - 100 / 24, 0]);
  });

  it("opens an incident when a check goes down, and closes it when it comes back", () => {
    const fail = { startMs: 5, durationMs: 1, ok: false, status: 503, error: "HTTP 503", tlsExpiresMs: null, finalUrl: check.url };
    expect(changeOf({ state: "up" }, fail)).toEqual({ state: "down", open: "HTTP 503", closeAtMs: null });
    expect(changeOf({ state: "down" }, fail).open).toBeNull();
    expect(changeOf({ state: "down" }, { ...fail, ok: true, error: null }).closeAtMs).toBe(5);
  });
});

describe("uptime telemetry", () => {
  it("writes a failed run as an uptime span with no query string or exception, and warns about a certificate near its end", () => {
    const r = { startMs: 1000, durationMs: 40, ok: false, status: 503, error: "expected status 200-299, got 503", tlsExpiresMs: 1000 + 3 * 86_400_000, finalUrl: check.url };
    const { spans, logs } = uptimeTelemetry(check, r);
    expect(spans[0]).toMatchObject({ category: "uptime", kind: "client", status: "error", statusMessage: r.error, events: [] });
    expect(spans[0]!.attributes["url.full"]).toBe("https://example.com/health");
    expect(logs.map((l) => l.log.level)).toEqual(["error", "warn"]);
  });

  it("never counts a run as app traffic, a service, or an error, new or written before", () => {
    const r = { startMs: 1000, durationMs: 40, ok: false, status: 503, error: "HTTP 503", tlsExpiresMs: null, finalUrl: check.url };
    const fresh = uptimeTelemetry(check, r).spans[0]!;
    const old: Span = { ...fresh, category: "http.server", kind: "server", events: [{ name: "exception", timeMs: 1040, attributes: { "exception.type": "UptimeCheckFailed", "exception.message": "Home: HTTP 503" } }] };
    for (const s of [fresh, old]) {
      const trace = buildTrace(s.traceId, [s], [], []);
      expect(requestOf(trace)).toBeNull();
      expect(errorEvents([trace])).toHaveLength(0);
      expect(serviceRows([trace])).toHaveLength(0);
      const kinds = traceFacts(trace).contributions.map((c) => c.kind);
      expect(kinds).not.toContain("svc");
      expect(kinds).not.toContain("err");
      expect(traceFacts(trace).contributions.filter((c) => c.kind === "up.chk")).toEqual([expect.objectContaining({ key: "ck1", err: 1 })]);
    }
  });

  it("gives the Uptime page runs, failures, and response time per check", () => {
    const m = runPageSync("uptime", pageContext("30d", SCENARIO_NOW, {}), memoryExecutor(scenarioTraces()));
    expect(m.checks.map((c) => c.checkId).sort()).toEqual(["ck-api", "ck-home"]);
    const total = m.checks.reduce((s, c) => s + c.runs, 0);
    expect(total).toBeGreaterThan(0);
    expect(m.checks.some((c) => c.failures > 0)).toBe(true);
    const one = runPageSync("uptime", pageContext("30d", SCENARIO_NOW, { check: "ck-api" }), memoryExecutor(scenarioTraces()));
    expect(one.checks.map((c) => c.checkId)).toEqual(["ck-api"]);
  });
});
