// "Above normal" alert rules: every service and endpoint over the rule's window against the same window in earlier weeks (or days).
import { type AnomalyMetric, judge, MIN_SAMPLES, overBy, type Verdict } from "../anomaly/baseline.js";
import { ANOMALY_LABEL } from "../anomaly/problems.js";
import { baselineModeOf, probeNeeds, shiftsOf } from "../anomaly/shifts.js";
import type { Agg } from "../scale/agg.js";
import type { ServiceRowInfo } from "../scale/facts-services.js";
import { KEY_SEP } from "../scale/kinds.js";
import type { NeedResults, PageDef, WindowRef } from "../scale/needs.js";
import type { AlertNoticeState } from "./alerts.js";
import { aggByKey, groupNeed, rowsOf } from "./read.js";

const LEVELS = [
  { id: "svc", kind: "svc" },
  { id: "ep", kind: "svc.ep" },
] as const;

const idOf = (level: string, win: WindowRef) => `aa.${level}.${String(win)}`;

/** The service or endpoint furthest above its normal. */
export interface AnomalyBreach extends Verdict {
  metric: AnomalyMetric;
  row: string;
  name: string;
  endpoint: string | null;
}

export interface AnomalyAlertValue {
  /** The breach's value, else the value furthest toward its line; null without data or a baseline. */
  value: number | null;
  breach: AnomalyBreach | null;
  /** True until two earlier weeks (or days) have data. */
  learning: boolean;
}

interface Judged extends AnomalyBreach {
  over: number;
}

function judgeKey(d: NeedResults, metric: AnomalyMetric, spreads: number, level: string, key: string, cur: Agg, shifts: readonly WindowRef[]): Verdict | null {
  const samples = shifts.map((s) => aggByKey(d, idOf(level, s)).get(key)).filter((a): a is Agg => !!a && a.n > 0);
  return judge(metric, cur, samples, spreads);
}

function judgedAll(d: NeedResults, metric: AnomalyMetric, spreads: number): Judged[] {
  const shifts = shiftsOf(baselineModeOf(d));
  const info = new Map(rowsOf(d, idOf("svc", "cur")).map((r) => [r.key, r.agg.top as ServiceRowInfo | null]));
  return LEVELS.flatMap((l) =>
    rowsOf(d, idOf(l.id, "cur")).flatMap(({ key, agg }) => {
      const sep = key.indexOf(KEY_SEP);
      const row = sep < 0 ? key : key.slice(0, sep);
      const v = judgeKey(d, metric, spreads, l.id, key, agg, shifts);
      const name = info.get(row)?.name;
      return v && name ? [{ ...v, metric, row, name, endpoint: sep < 0 ? null : key.slice(sep + 1), over: overBy(v) }] : [];
    }),
  );
}

/** An "above normal" rule as a page, run with `alertContext` like the threshold rules. */
export function anomalyAlertPage(metric: AnomalyMetric, spreads: number): PageDef<AnomalyAlertValue> {
  return {
    needs: () => [...probeNeeds(), groupNeed(idOf("svc", "cur"), "svc", "cur", { hist: true, top: true }), groupNeed(idOf("ep", "cur"), "svc.ep", "cur", { hist: true })],
    followUp: (_ctx, first) => shiftsOf(baselineModeOf(first)).flatMap((s) => LEVELS.map((l) => groupNeed(idOf(l.id, s), l.kind, s, { hist: true }))),
    model(d) {
      const judged = judgedAll(d, metric, spreads).sort((a, b) => b.over - a.over || (a.row < b.row ? -1 : 1));
      const top = judged.find((j) => j.above) ?? null;
      const samples = shiftsOf(baselineModeOf(d)).filter((s) => rowsOf(d, idOf("svc", s)).length > 0).length;
      const strip = (j: Judged): AnomalyBreach => ({ metric: j.metric, row: j.row, name: j.name, endpoint: j.endpoint, value: j.value, normal: j.normal, upper: j.upper, above: j.above });
      return { value: (top ?? judged[0])?.value ?? null, breach: top && strip(top), learning: samples < MIN_SAMPLES };
    },
  };
}

/** "p95 duration is above normal on orders GET /orders: 950 ms (normal 300 ms, line 520 ms)". */
export function anomalyAlertMessage(metric: AnomalyMetric, r: AnomalyAlertValue, state: AlertNoticeState): string {
  const label = ANOMALY_LABEL[metric];
  const unit = (n: number) => (metric === "error_rate" ? `${n.toFixed(1)}%` : metric === "p95_ms" ? `${Math.round(n)} ms` : `${Math.round(n)} requests`);
  if (state === "test") return `${label} alerts when a service or endpoint is above its normal.`;
  if (!r.breach) return r.learning ? `${label}: not enough history yet to know what is normal.` : `${label} is back to normal everywhere.`;
  const b = r.breach;
  const where = b.endpoint ? `${b.name} ${b.endpoint}` : b.name;
  return `${label} is ${state === "remind" ? "still " : ""}above normal on ${where}: ${unit(b.value)} (normal ${unit(b.normal)}, alerts above ${unit(b.upper)})`;
}
