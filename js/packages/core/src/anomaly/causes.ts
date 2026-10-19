// Suspected causes of a problem: a new release, a new error group, a slower or busier query, or a service further down the calls.
import type { ServiceEdge, ServiceKind } from "../stats/services.js";
import type { AnomalyMetric } from "./baseline.js";
import { overBy } from "./baseline.js";
import type { Anomaly } from "./detect.js";

export type SuspectedCause =
  | { kind: "release"; service: string; version: string; atMs: number }
  | { kind: "error"; key: string; service: string; type: string; message: string; atMs: number; count: number }
  | { kind: "query"; database: string; row: string; query: string; metric: AnomalyMetric; value: number; normal: number }
  | { kind: "downstream"; service: string; row: string; serviceKind: ServiceKind };

/** A version of a service in the window: when it first sent, and whether the week before had it. */
export interface VersionSeen {
  service: string;
  version: string;
  firstMs: number;
  isNew: boolean;
}

/** An error group in the window: when it first happened, and whether the week before had it. */
export interface ErrorSeen {
  key: string;
  service: string;
  type: string;
  message: string;
  firstMs: number;
  count: number;
  isNew: boolean;
}

/** Who calls whom, by service name. */
export interface CallMap {
  calls(from: string, to: string): boolean;
}

export const callMapOf = (edges: readonly ServiceEdge[]): CallMap => {
  const pairs = new Set(edges.map((e) => `${e.from}\u0000${e.to}`));
  return { calls: (from, to) => pairs.has(`${from}\u0000${to}`) };
};

export interface CauseInputs {
  versions: readonly VersionSeen[];
  errors: readonly ErrorSeen[];
  map: CallMap;
  nearMs: number;
  bucketMs: number;
}

interface ProblemSpan {
  startMs: number;
  endMs: number;
  anomalies: readonly Anomaly[];
}

const namesOf = (p: ProblemSpan) => new Set(p.anomalies.map((a) => a.name));

/** A version first seen shortly before the problem started (or in its first bucket); the newest such one. */
function releaseCause(p: ProblemSpan, inp: CauseInputs): SuspectedCause | null {
  const names = namesOf(p);
  const near = inp.versions.filter((v) => v.isNew && names.has(v.service) && v.firstMs >= p.startMs - inp.nearMs && v.firstMs < p.startMs + inp.bucketMs);
  const best = near.sort((a, b) => b.firstMs - a.firstMs || (a.version < b.version ? -1 : 1))[0];
  return best ? { kind: "release", service: best.service, version: best.version, atMs: best.firstMs } : null;
}

/** A new error group of a problem service that first happened closest to the start. */
function errorCause(p: ProblemSpan, inp: CauseInputs): SuspectedCause | null {
  const names = namesOf(p);
  const near = inp.errors.filter((e) => e.isNew && names.has(e.service) && e.firstMs >= p.startMs - inp.nearMs && e.firstMs < p.endMs);
  const gap = (e: ErrorSeen) => Math.abs(e.firstMs - p.startMs);
  const best = near.sort((a, b) => gap(a) - gap(b) || b.count - a.count || (a.key < b.key ? -1 : 1))[0];
  return best ? { kind: "error", key: best.key, service: best.service, type: best.type, message: best.message, atMs: best.firstMs, count: best.count } : null;
}

/** A query above its normal (slower, failing, or run far more often), the furthest over. */
function queryCause(p: ProblemSpan): SuspectedCause | null {
  const queries = p.anomalies.filter((a) => a.kind === "database" && a.endpoint !== null);
  const best = [...queries].sort((a, b) => overBy(b.peak) - overBy(a.peak))[0];
  if (!best) return null;
  return { kind: "query", database: best.name, row: best.row, query: best.endpoint!, metric: best.metric, value: best.peak.value, normal: best.peak.normal };
}

/** The service that others in the problem call, and that calls none of them: the bottom of the chain. */
function downstreamCause(p: ProblemSpan, map: CallMap): SuspectedCause | null {
  const names = [...namesOf(p)];
  if (names.length < 2) return null;
  const sinks = names.filter((n) => names.some((o) => o !== n && map.calls(o, n)) && !names.some((o) => o !== n && map.calls(n, o)));
  const first = p.anomalies.find((a) => sinks.includes(a.name));
  return first ? { kind: "downstream", service: first.name, row: first.row, serviceKind: first.kind } : null;
}

const QUERY_WHAT: Record<AnomalyMetric, string> = { error_rate: "fails more than", p95_ms: "is slower than", requests: "runs more often than" };

/** A cause in one sentence, for cards, notices, and AI tools. */
export function causeText(c: SuspectedCause): string {
  if (c.kind === "release") return `${c.service} ${c.version} was released as it started.`;
  if (c.kind === "error") return `A new error in ${c.service}: ${c.type}: ${c.message}`;
  if (c.kind === "query") return `A query on ${c.database} ${QUERY_WHAT[c.metric]} normal: ${c.query}`;
  return `${c.service}, further down the calls, is above normal too.`;
}

/** Every suspected cause found, most telling first: release, new error, query, then downstream service. */
export function causesOf(p: ProblemSpan, inp: CauseInputs): SuspectedCause[] {
  return [releaseCause(p, inp), errorCause(p, inp), queryCause(p), downstreamCause(p, inp.map)].filter((c): c is SuspectedCause => c !== null);
}
