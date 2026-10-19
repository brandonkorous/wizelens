// Problems: anomalies that start close together on services joined in the call map, as one card with a suspected cause.
import type { ServiceKind } from "../stats/services.js";
import { type AnomalyMetric, overBy } from "./baseline.js";
import { type CallMap, type CauseInputs, causesOf, type SuspectedCause } from "./causes.js";
import type { Anomaly } from "./detect.js";

/** Anomalies kept on one problem card; the rest are counted. */
export const PROBLEM_ANOMALIES_MAX = 20;
/** Anomalies grouped at most; the newest are dropped past this, so a broken baseline cannot stall a page. */
const ANOMALIES_MAX = 2000;

export const ANOMALY_LABEL: Record<AnomalyMetric, string> = { error_rate: "Error rate", p95_ms: "p95 duration", requests: "Traffic" };

export interface ProblemService {
  row: string;
  name: string;
  kind: ServiceKind;
}

export interface Problem {
  id: string;
  title: string;
  /** The metric of the first anomaly. */
  metric: AnomalyMetric;
  startMs: number;
  endMs: number;
  ongoing: boolean;
  services: ProblemService[];
  /** Furthest over normal first, at most 20. */
  anomalies: Anomaly[];
  anomalyCount: number;
  /** The most telling suspected cause, or null when nothing stands out. */
  cause: SuspectedCause | null;
  causes: SuspectedCause[];
}

const linked = (a: Anomaly, b: Anomaly, map: CallMap) => a.name === b.name || map.calls(a.name, b.name) || map.calls(b.name, a.name);

/** Groups of anomalies: two join when they start within `nearMs` of each other on the same or calling services. */
export function groupAnomalies(anomalies: readonly Anomaly[], map: CallMap, nearMs: number): Anomaly[][] {
  const list = anomalies.slice(0, ANOMALIES_MAX);
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j]!.startMs - list[i]!.startMs <= nearMs; j++) {
      if (linked(list[i]!, list[j]!, map)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Anomaly[]>();
  list.forEach((a, i) => groups.get(find(i))?.push(a) ?? groups.set(find(i), [a]));
  return [...groups.values()];
}

/** FNV-1a, in base 36: a short id that is the same on every host for the same data. */
function hashId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

function servicesOf(group: readonly Anomaly[]): ProblemService[] {
  const seen = new Map<string, ProblemService>();
  for (const a of group) if (!seen.has(a.row)) seen.set(a.row, { row: a.row, name: a.name, kind: a.kind });
  return [...seen.values()];
}

/** The service a problem is named after: the one its cause points at, else where it started. */
function rootOf(cause: SuspectedCause | null, first: Anomaly): string {
  if (!cause) return first.name;
  return cause.kind === "query" ? cause.database : cause.service;
}

/** "p95 duration above normal on pay and 2 more": the root's worst metric. */
function titleOf(group: readonly Anomaly[], root: string, names: number): string {
  const onRoot = group.filter((a) => a.name === root);
  const worst = [...(onRoot.length ? onRoot : group)].sort((a, b) => overBy(b.peak) - overBy(a.peak))[0]!;
  const more = names > 1 ? ` and ${names - 1} more` : "";
  return `${ANOMALY_LABEL[worst.metric]} above normal on ${root}${more}`;
}

/** One problem card from a group of anomalies (earliest first). */
export function problemOf(group: readonly Anomaly[], inp: CauseInputs): Problem {
  const first = group[0]!;
  const startMs = first.startMs;
  const endMs = Math.max(...group.map((a) => a.endMs));
  const causes = causesOf({ startMs, endMs, anomalies: group }, inp);
  const cause = causes[0] ?? null;
  const services = servicesOf(group);
  const names = new Set(services.map((s) => s.name)).size;
  return {
    id: hashId(`${first.row}|${first.metric}|${startMs}`),
    title: titleOf(group, rootOf(cause, first), names),
    metric: first.metric,
    startMs,
    endMs,
    ongoing: group.some((a) => a.ongoing),
    services,
    anomalies: [...group].sort((a, b) => overBy(b.peak) - overBy(a.peak) || a.startMs - b.startMs).slice(0, PROBLEM_ANOMALIES_MAX),
    anomalyCount: group.length,
    cause,
    causes,
  };
}

/** Problems from anomalies: ongoing ones first, then the newest. */
export function problemsOf(anomalies: readonly Anomaly[], inp: CauseInputs): Problem[] {
  const problems = groupAnomalies(anomalies, inp.map, inp.nearMs).map((g) => problemOf(g, inp));
  return problems.sort((a, b) => Number(b.ongoing) - Number(a.ongoing) || b.startMs - a.startMs || (a.id < b.id ? -1 : 1));
}
