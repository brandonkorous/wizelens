import { describe, expect, it } from "vitest";
import { dbCalls, dbSummary, operationRows, queryRows, tableRows } from "../stats/database.js";
import { errorEvents, errorGroups, errorTypeCounts } from "../stats/errors.js";
import { levelCounts, LOG_LEVELS, logRows } from "../stats/logs.js";
import { sumKind, totalOf } from "../testing/scale-util.js";
import { scenarioTraces } from "../testing/scenario.js";
import { avgOfAgg } from "./agg.js";
import type { QueryTop } from "./facts-db.js";
import { joinKey, KEY_SEP, splitKey } from "./kinds.js";

const traces = scenarioTraces();
const calls = dbCalls(traces);
const keysUnder = (groups: Map<string, unknown>, prefix: string) => [...groups.keys()].filter((k) => k.startsWith(prefix + KEY_SEP)).map((k) => splitKey(k)[1]!);

describe("database facts", () => {
  it("db gives the summary, with the slow threshold fixed when facts are built", () => {
    for (const slowMs of [100, 20]) {
      const a = totalOf(traces, "db", { slowQueryMs: slowMs });
      const want = dbSummary(calls, slowMs);
      expect([a.n, a.c[0]]).toEqual([want.queries, want.slow]);
      expect(a.sum).toBeCloseTo(want.totalMs, 6);
      expect(avgOfAgg(a)).toBeCloseTo(want.avgMs!, 6);
    }
  });

  it("db.q and db.qe give the query shapes", () => {
    const q = sumKind(traces, "db.q");
    const qe = sumKind(traces, "db.qe");
    const want = queryRows(calls, 100);
    expect(q.size).toBe(want.length);
    for (const r of want) {
      const a = q.get(r.key)!;
      const top = a.top as QueryTop;
      expect([a.n, a.c[0], a.err, top.durationMs, top.traceId, top.system]).toEqual([r.count, r.slow, r.errors, r.maxMs, r.exampleTraceId, r.system]);
      expect(a.sum).toBeCloseTo(r.totalMs, 6);
      expect(new Set(keysUnder(qe, r.key))).toEqual(new Set(r.endpoints));
      expect(qe.get(joinKey(r.key, r.endpoints[0]!))!.n).toBe(Math.max(...keysUnder(qe, r.key).map((e) => qe.get(joinKey(r.key, e))!.n)));
    }
  });

  it("db.t and db.op give tables and operations", () => {
    const t = sumKind(traces, "db.t");
    const tables = tableRows(calls);
    expect(t.size).toBe(tables.length);
    for (const r of tables) {
      const a = t.get(r.table)!;
      expect([a.n, a.c[0]! > 0 ? a.c[1] : null]).toEqual([r.queries, r.rows]);
      expect(a.sum).toBeCloseTo(r.totalMs, 6);
    }
    const ops = sumKind(traces, "db.op");
    for (const r of operationRows(calls)) {
      expect(ops.get(r.operation)?.n ?? 0).toBe(r.count);
      expect(ops.get(r.operation)?.sum ?? 0).toBeCloseTo(r.totalMs, 6);
    }
  });
});

describe("error facts", () => {
  const events = errorEvents(traces);

  it("err and err.g give the error groups", () => {
    const total = totalOf(traces, "err");
    expect([total.n, total.c[0]]).toEqual([events.length, events.filter((e) => e.critical).length]);
    const g = sumKind(traces, "err.g");
    const ge = sumKind(traces, "err.ge");
    const groups = errorGroups(events);
    expect(g.size).toBe(groups.length);
    for (const want of groups) {
      const a = g.get(want.key)!;
      expect([a.n, a.firstMs, a.lastMs, a.c[0]! > 0]).toEqual([want.count, want.firstSeenMs, want.lastSeenMs, want.critical]);
      expect(a.top).toEqual(want.latest);
      expect(new Set(keysUnder(ge, want.key))).toEqual(new Set(want.endpoints));
      expect(new Set(a.ids)).toEqual(new Set(want.traceIds));
      expect(a.ids[0]).toBe(want.latest.traceId);
    }
  });

  it("err.t, err.s, and err.e give types, services, and endpoints", () => {
    const types = sumKind(traces, "err.t");
    for (const t of errorTypeCounts(events)) expect(types.get(t.type)!.n).toBe(t.count);
    const services = sumKind(traces, "err.s");
    for (const s of new Set(events.map((e) => e.service))) expect(services.get(s)!.n).toBe(events.filter((e) => e.service === s).length);
    expect(sumKind(traces, "err.e").size).toBe(new Set(events.map((e) => e.endpoint)).size);
  });
});

describe("log facts", () => {
  it("log and log.s count lines per level and service", () => {
    const all = logRows(traces);
    const counts = levelCounts(all);
    const levels = sumKind(traces, "log");
    for (const l of LOG_LEVELS) expect(levels.get(l)?.n ?? 0).toBe(counts[l]);
    expect(LOG_LEVELS.every((l) => counts[l] > 0)).toBe(true);
    const byService = sumKind(traces, "log.s");
    for (const r of new Set(all.map((x) => joinKey(x.service, x.level)))) {
      const [service, level] = splitKey(r);
      expect(byService.get(r)!.n).toBe(all.filter((x) => x.service === service && x.level === level).length);
    }
    expect([...byService.keys()].some((k) => k.startsWith("Web App" + KEY_SEP))).toBe(true);
  });
});
