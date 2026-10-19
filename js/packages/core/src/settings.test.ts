import { describe, expect, it } from "vitest";
import { REDACTED } from "./redact.js";
import { traceFacts } from "./scale/facts.js";
import { effectiveSettings, factOptionsOf, parseSettings, redactSignals, settingsOf } from "./settings.js";
import { scenarioTraces } from "./testing/scenario.js";

const DEFAULTS = { slowQueryMs: 100, nPlusOneThreshold: 5, redactKeys: ["token"], retentionDays: 30 };

describe("project settings", () => {
  it("checks values, drops empty ones, and refuses a longer retention than the host keeps", () => {
    expect(parseSettings({ slowQueryMs: "250", nPlusOneThreshold: "", redactKeys: [" SSN ", "ssn", ""] }, 30)).toEqual({ slowQueryMs: 250, redactKeys: ["ssn"] });
    expect(() => parseSettings({ retentionDays: 31 }, 30)).toThrow(/1 to 30/);
    expect(() => parseSettings({ nPlusOneThreshold: 1 }, 30)).toThrow(/N\+1/);
    expect(settingsOf("not json")).toEqual({});
  });

  it("adds the project's keys to the host's, and keeps the shorter retention", () => {
    const s = effectiveSettings(DEFAULTS, { redactKeys: ["ssn"], retentionDays: 90, slowQueryMs: 50 });
    expect(s).toEqual({ slowQueryMs: 50, nPlusOneThreshold: 5, redactKeys: ["token", "ssn"], retentionDays: 30 });
  });

  it("hides the extra keys in span, event, log, and metric attributes, and in DB parameters", () => {
    const span = { attributes: { "user.ssn": "1", "wizelens.db.parameters": JSON.stringify({ ssn: 2, id: 3 }) }, events: [{ name: "e", timeMs: 0, attributes: { ssn: "x" } }] };
    const w = redactSignals({ spans: [span], logs: [{ traceId: "t", log: { attributes: { ssn: "y" } } }], metrics: [{ attributes: { ssn: "z" } }] } as never, ["ssn"]) as never as { spans: typeof span[]; logs: { log: { attributes: Record<string, unknown> } }[]; metrics: { attributes: Record<string, unknown> }[] };
    expect(w.spans[0]!.attributes["user.ssn"]).toBe(REDACTED);
    expect(JSON.parse(w.spans[0]!.attributes["wizelens.db.parameters"])).toEqual({ ssn: REDACTED, id: 3 });
    expect(w.spans[0]!.events[0]!.attributes.ssn).toBe(REDACTED);
    expect(w.logs[0]!.log.attributes.ssn).toBe(REDACTED);
    expect(w.metrics[0]!.attributes.ssn).toBe(REDACTED);
  });

  it("settles a trace with the project's thresholds", () => {
    const traces = scenarioTraces();
    const insights = (o: Parameters<typeof factOptionsOf>[0]) => traces.reduce((n, t) => n + (traceFacts(t, factOptionsOf(o)).request?.insights ?? 0), 0);
    expect(insights({ nPlusOneThreshold: 1000, slowQueryMs: 60_000 })).toBeLessThan(insights({}));
    expect(insights({ slowQueryMs: 1 })).toBeGreaterThan(insights({}));
  });
});
