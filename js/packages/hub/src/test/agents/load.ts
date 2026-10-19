import { readFileSync } from "node:fs";
import { analyzeTrace, buildTrace, DEFAULT_REDACT_KEYS, type Finding, type Span, type Trace } from "@wizeworks/lens-core";
import type { OtlpResourceLogs } from "../../otlp/logs.js";
import { type OtlpResourceSpans, writesFromSpans } from "../../otlp/spans.js";

/** OTLP exports captured from samples/java-spring, python-fastapi, and go-net-http, cut to the sample requests. */
export interface AgentFixture {
  resourceSpans: OtlpResourceSpans[];
  resourceLogs: OtlpResourceLogs[];
}

/** `agents-otel.json`: the plain agents. `agents-wizelens.json`: the agents with the WizeLens SDKs and body capture on. */
export function loadFixture(name: "agents-otel" | "agents-wizelens"): AgentFixture {
  return JSON.parse(readFileSync(new URL(`./${name}.json`, import.meta.url), "utf8")) as AgentFixture;
}

/** The fixture's traces, mapped the way the hub maps them. */
export function tracesOf(f: AgentFixture): Trace[] {
  const byTrace = new Map<string, Span[]>();
  for (const w of writesFromSpans(f.resourceSpans, DEFAULT_REDACT_KEYS)) {
    for (const s of w.spans) byTrace.set(s.traceId, [...(byTrace.get(s.traceId) ?? []), s]);
  }
  return [...byTrace].map(([id, spans]) => buildTrace(id, spans, [], []));
}

/** The trace whose root is this request on this service. */
export function traceOf(traces: readonly Trace[], service: string, rootName: string): Trace {
  const t = traces.find((x) => x.service === service && x.rootName === rootName);
  if (!t) throw new Error(`no ${service} ${rootName} trace in the fixture`);
  return t;
}

/** "kind shape" for each finding, sorted, so tests read like the insights list. */
export function findingsOf(t: Trace): string[] {
  return analyzeTrace(t)
    .filter((f: Finding) => f.kind !== "error")
    .map((f: Finding) => `${f.kind} ${f.kind === "db-wait" ? f.count : f.shape}`)
    .sort();
}

const b64 = (hex: string | undefined) => (hex ? Buffer.from(hex, "hex").toString("base64") : hex);

/** The spans with base64 ids, the form the protobuf encoder takes (OTLP/JSON uses hex). */
export function forProtobuf(list: readonly OtlpResourceSpans[]): OtlpResourceSpans[] {
  return list.map((rs) => ({
    ...rs,
    scopeSpans: (rs.scopeSpans ?? []).map((ss) => ({
      ...ss,
      spans: (ss.spans ?? []).map((s) => ({ ...s, traceId: b64(s.traceId), spanId: b64(s.spanId), parentSpanId: b64(s.parentSpanId) })),
    })),
  }));
}

const NANOS =["startTimeUnixNano", "endTimeUnixNano", "timeUnixNano", "observedTimeUnixNano"] as const;

function shift(o: unknown, by: bigint): void {
  if (Array.isArray(o)) return o.forEach((x) => shift(x, by));
  if (!o || typeof o !== "object") return;
  const rec = o as Record<string, unknown>;
  for (const k of NANOS) if (typeof rec[k] === "string" && rec[k] !== "0") rec[k] = String(BigInt(rec[k] as string) + by);
  for (const v of Object.values(rec)) if (typeof v === "object") shift(v, by);
}

/** The fixture moved in time so its first span starts a minute ago, inside any page range. */
export function rebased(f: AgentFixture): AgentFixture {
  const copy = structuredClone(f);
  const starts = copy.resourceSpans.flatMap((r) => (r.scopeSpans ?? []).flatMap((s) => (s.spans ?? []).map((x) => BigInt(String(x.startTimeUnixNano)))));
  const first = starts.reduce((a, b) => (b < a ? b : a));
  shift(copy, BigInt(Date.now() - 60_000) * 1_000_000n - first);
  return copy;
}
