import { type AlertOp, type AlertRuleInput, isAnomalyMetric } from "@wizeworks/lens-core/internal";
import { Field, SelectField } from "../../ui/Field";

type Set = <K extends keyof AlertRuleInput>(k: K) => (v: AlertRuleInput[K]) => void;

const OPS: [AlertOp, string][] = [
  [">", "is above"],
  [">=", "is at or above"],
  ["<", "is below"],
  ["<=", "is at or below"],
  ["above_normal", "is above normal"],
];

/** How many spreads above normal an "above normal" rule fires at. */
const SENSITIVITY: [string, string][] = [
  ["2", "High sensitivity"],
  ["3", "Medium sensitivity"],
  ["4", "Low sensitivity"],
];

/** The condition and threshold, or for "above normal" the sensitivity; a metric without a baseline has no "above normal". */
export function LineFields({ r, set }: { r: AlertRuleInput; set: Set }) {
  const ops = isAnomalyMetric(r.metric) ? OPS : OPS.filter(([op]) => op !== "above_normal");
  const spreads = SENSITIVITY.some(([v]) => Number(v) === r.threshold) ? String(r.threshold) : "3";
  return (
    <>
      <SelectField label="Condition" value={r.op} options={ops} onChange={(op) => (set("op")(op), op === "above_normal" && set("threshold")(3))} />
      {r.op === "above_normal" ? (
        <SelectField label="Sensitivity" value={spreads} options={SENSITIVITY} onChange={(v) => set("threshold")(Number(v))} />
      ) : (
        <Field label="Threshold" type="number" step="any" required value={r.threshold} onChange={(e) => set("threshold")(Number(e.target.value))} />
      )}
    </>
  );
}

/** The note under an "above normal" rule. */
export const AboveNormalNote = () => (
  <p className="wl-muted wl-small">Fires when any service or endpoint is above its normal: the same window at the same time in earlier weeks (or days, on hosts that keep less). The notice names it and, in the cloud, links to its problem.</p>
);
