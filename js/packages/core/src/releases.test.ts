import { describe, expect, it } from "vitest";
import { runPageSync } from "./models/index.js";
import { stampVersion, VERSION_ATTR } from "./releases.js";
import type { Attributes, Span } from "./types.js";
import { memoryExecutor } from "./scale/memory.js";
import { pageContext } from "./scale/run.js";
import { SCENARIO_NOW, scenarioTraces } from "./testing/scenario.js";

const ex = memoryExecutor(scenarioTraces());
const page = <P extends Parameters<typeof runPageSync>[0]>(p: P, range: "24h" | "7d" | "30d", params: Record<string, string> = {}) => runPageSync(p, pageContext(range, SCENARIO_NOW, params), ex);

describe("releases", () => {
  it("copies the sender's version onto its own spans only, and keeps a version a span already has", () => {
    const span = (service: string, attributes: Attributes = {}): Span => ({ traceId: "t", spanId: service, parentSpanId: null, name: "x", kind: "server" as const, category: "http.server" as const, service, startMs: 0, durationMs: 1, status: "ok" as const, statusMessage: null, attributes, events: [] });
    const out = stampVersion([span("api"), span("db"), span("api", { [VERSION_ATTR]: "0.9" })], { service: "api", release: "1.2" });
    expect(out.map((s) => s.attributes[VERSION_ATTR] ?? null)).toEqual(["1.2", null, "0.9"]);
  });

  it("marks the versions that first sent data in the range on every page's meta", () => {
    const shown = (m: { meta: { releases: { service: string; version: string }[] } }) => [...new Set(m.meta.releases.map((r) => r.version))].sort();
    expect(shown(page("overview", "24h"))).toEqual(["1.1.0", "1.2.0"]);
    expect(shown(page("errors", "30d"))).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
  });

  it("compares a service's versions, newest first", () => {
    const m = page("service", "7d", { service: "api:api" });
    expect(m.versions.map((v) => v.version)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
    expect(m.versions.every((v) => v.requests > 0 && v.p95Ms !== null)).toBe(true);
    expect(m.versions.find((v) => v.version === "1.0.0")!.newErrors).toBeGreaterThan(0);
    expect(m.versions.find((v) => v.version === "1.2.0")!.newErrors).toBe(0);
  });

  it("lists the error groups and insights a release brought", () => {
    const all = page("errors", "7d", { service: "api", size: "200" });
    expect(all.releases.map((r) => r.version)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
    expect(page("errors", "7d", { service: "api", release: "1.0.0", size: "200" }).groupCount).toBe(all.groupCount);
    expect(page("errors", "7d", { service: "api", release: "1.2.0", size: "200" }).groupCount).toBe(0);
    expect(page("errors", "7d", { release: "1.0.0", size: "200" }).filter.release).toBe("");
    const ins = page("insights", "30d", { service: "api" });
    expect(page("insights", "30d", { service: "api", release: "1.2.0" }).matching).toBe(0);
    expect(page("insights", "30d", { service: "api", release: "1.0.0" }).matching).toBe(ins.matching);
  });
});
