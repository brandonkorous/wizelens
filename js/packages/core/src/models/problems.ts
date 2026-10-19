// The Problems page: services and endpoints above their normal, grouped into problems with a suspected cause.
import { DEFAULT_SPREADS, isSensitivity, MIN_SAMPLES, SENSITIVITY, type Sensitivity } from "../anomaly/baseline.js";
import { callMapOf } from "../anomaly/causes.js";
import { detectAnomalies } from "../anomaly/detect.js";
import { type Problem, problemsOf } from "../anomaly/problems.js";
import { type BaselineMode, baselineModeOf } from "../anomaly/shifts.js";
import type { ServiceRowInfo } from "../scale/facts-services.js";
import type { PageData, PageDef } from "../scale/needs.js";
import { bucketStarts } from "../stats/common.js";
import { type ModelMeta, metaOf } from "./input.js";
import { errorsOf, keyBucketsOf, problemFollowUp, problemGrid, problemNeeds, samplesOf, versionsSeenOf } from "./problems-read.js";
import { rowsOf } from "./read.js";
import { edgesOfRows, serviceRowsId } from "./service-rows.js";

/** Problems listed at most, ongoing and newest first. */
export const PROBLEMS_MAX = 50;
/** Anomalies at most this far apart (or two buckets, if longer) can be one problem. */
export const PROBLEM_NEAR_MS = 15 * 60_000;

export interface ProblemsModel {
  meta: ModelMeta;
  /** What "normal" is read from: the same hour in earlier weeks (or days), and how many of them had data. Learning until two do. */
  baseline: { mode: BaselineMode; samples: number; learning: boolean };
  sensitivity: Sensitivity;
  starts: number[];
  bucketMs: number;
  problems: Problem[];
  /** Problems before the limit. */
  total: number;
  ongoing: number;
  anomalies: number;
  /** Services in any problem. */
  services: number;
  /** The problem named by `problem`, or found by `at` (and `focus`). */
  selected: Problem | null;
}

const sensitivityOf = (v: string | undefined): Sensitivity => (isSensitivity(v) ? v : "medium");

/** True when a Services row of the problem has this key or name. */
const involves = (p: Problem, who: string) => p.services.some((s) => s.row === who || s.name === who);

/** The problem by id; else the one nearest `at` that has the `focus` service (a row key or name), within two near spans. */
export function findProblem(problems: readonly Problem[], params: Readonly<Record<string, string>>, nearMs: number): Problem | null {
  const byId = params.problem ? problems.find((p) => p.id === params.problem) : undefined;
  if (byId) return byId;
  const at = Number(params.at);
  if (!params.at || !Number.isFinite(at)) return null;
  const wanted = params.focus;
  const gap = (p: Problem) => (at < p.startMs ? p.startMs - at : at > p.endMs ? at - p.endMs : 0);
  const fits = problems.filter((p) => (!wanted || involves(p, wanted)) && gap(p) <= 2 * nearMs);
  return fits.sort((a, b) => gap(a) - gap(b) || b.startMs - a.startMs)[0] ?? null;
}

function rowInfoOf(d: PageData): (row: string) => ServiceRowInfo | null {
  const map = new Map(rowsOf(d, serviceRowsId("cur")).map((r) => [r.key, r.agg.top as ServiceRowInfo | null]));
  return (row) => map.get(row) ?? null;
}

function problemsModel(d: PageData): ProblemsModel {
  const mode = baselineModeOf(d);
  const { window, buckets, bucketMs } = problemGrid(d);
  const starts = bucketStarts(window, buckets);
  const sensitivity = sensitivityOf(d.params.sensitivity);
  const spreads = SENSITIVITY[sensitivity] ?? DEFAULT_SPREADS;
  const anomalies = detectAnomalies(keyBucketsOf(d, mode), { starts, bucketMs, spreads, rowInfo: rowInfoOf(d) });
  const nearMs = Math.max(2 * bucketMs, PROBLEM_NEAR_MS);
  const found = problemsOf(anomalies, { versions: versionsSeenOf(d), errors: errorsOf(d, d), map: callMapOf(edgesOfRows(d)), nearMs, bucketMs });
  const samples = samplesOf(d, mode);
  // The chosen service (the top bar filter) keeps the problems it is part of.
  const all = d.params.service ? found.filter((p) => involves(p, d.params.service!)) : found;
  return {
    meta: metaOf(d),
    baseline: { mode, samples, learning: samples < MIN_SAMPLES },
    sensitivity,
    starts,
    bucketMs,
    problems: all.slice(0, PROBLEMS_MAX),
    total: all.length,
    ongoing: all.filter((p) => p.ongoing).length,
    anomalies: all.reduce((t, p) => t + p.anomalyCount, 0),
    services: new Set(all.flatMap((p) => p.services.map((s) => s.row))).size,
    selected: findProblem(found, d.params, nearMs),
  };
}

/** The Problems page. Params: service (the chosen service), sensitivity (high, medium, low), and from a link problem (an id), at (ms), and focus (a service). */
export const problemsPage: PageDef<ProblemsModel> = {
  needs: () => problemNeeds(),
  followUp: problemFollowUp,
  model: problemsModel,
};
