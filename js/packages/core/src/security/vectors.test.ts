import { describe, expect, it } from "vitest";
import { buildTrace } from "../trace.js";
import type { Attributes, LogRecord, Span, SpanCategory } from "../types.js";
import { findSecurity } from "./index.js";

interface VSpan {
  spanId: string;
  parentSpanId?: string;
  category: SpanCategory;
  attributes: Attributes;
}
interface VLog {
  spanId: string | null;
  message: string;
  attributes: Attributes;
}
interface VFinding {
  kind: string;
  severity: string;
  shape: string;
  count: number;
  spanIds: string[];
}
interface Case {
  name: string;
  spans: VSpan[];
  logs?: VLog[];
  findings: VFinding[];
}

// The shared cases in docs/security-vectors.json; the .NET suite runs the same file.
const url = new URL("../../../../../docs/security-vectors.json", import.meta.url).href;
const cases = (await import(url, { with: { type: "json" } })).default.cases as Case[];

const TRACE = "0".repeat(31) + "1";

const spanOf = (v: VSpan, i: number): Span => ({
  traceId: TRACE,
  spanId: v.spanId,
  parentSpanId: v.parentSpanId ?? null,
  name: `span ${i}`,
  kind: v.category === "http.server" ? "server" : "client",
  category: v.category,
  service: "api",
  startMs: 1000 + i,
  durationMs: 10,
  status: "ok",
  statusMessage: null,
  attributes: v.attributes,
  events: [],
});

const logOf = (l: VLog): LogRecord => ({ timeMs: 1000, level: "info", category: "app", service: "api", ...l });

const byKindShape = (a: VFinding, b: VFinding) => (a.kind === b.kind ? (a.shape < b.shape ? -1 : 1) : a.kind < b.kind ? -1 : 1);

describe("security vectors", () => {
  for (const c of cases) {
    it(c.name, () => {
      const trace = buildTrace(TRACE, c.spans.map(spanOf), (c.logs ?? []).map(logOf), []);
      const got = findSecurity(trace).map((f) => ({ kind: f.kind, severity: f.severity, shape: f.shape, count: f.count, spanIds: f.spanIds }));
      expect(got.sort(byKindShape)).toEqual([...c.findings].sort(byKindShape));
    });
  }
});
