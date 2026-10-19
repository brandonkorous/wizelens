import { type FormEvent, useState } from "react";
import { ALERT_METRICS, type AlertMetric, type AlertOp, isAnomalyMetric } from "@wizeworks/lens-core";
import { Select } from "../../ui/Controls";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { type AlertRule, type Channel, WINDOWS } from "./alertTypes";
import { ChannelFields } from "./ChannelFields";
import { MetricRuleFields } from "./MetricRuleFields";

export type RuleDraft = Omit<AlertRule, "id" | "state" | "lastValue" | "lastEvalMs">;

const METRICS: [AlertMetric | "metric", string][] = [
  ...Object.entries(ALERT_METRICS).map(([k, m]): [AlertMetric, string] => [k as AlertMetric, `${m.label}${m.unit ? ` (${m.unit})` : ""}`]),
  ["metric", "A metric (CPU, memory, your own)"],
];
const OPS: [AlertOp, string][] = [
  [">", "is above"],
  ["<", "is below"],
  ["above_normal", "is above normal"],
];
/** How many spreads above normal an "above normal" rule fires at. */
const SENSITIVITY: [string, string][] = [
  ["2", "High sensitivity"],
  ["3", "Medium sensitivity"],
  ["4", "Low sensitivity"],
];

/** The threshold, or for "above normal" the sensitivity; a metric without a baseline turns "above normal" off. */
function LineFields({ r, set }: { r: RuleDraft; set: <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => void }) {
  const normal = r.op === "above_normal";
  const ops = isAnomalyMetric(r.metric) ? OPS : OPS.filter(([op]) => op !== "above_normal");
  const spreads = SENSITIVITY.some(([v]) => Number(v) === r.threshold) ? String(r.threshold) : "3";
  return (
    <>
      <Select label="Condition" value={r.op} options={ops} onChange={(op) => (set("op")(op), op === "above_normal" && set("threshold")(3))} />
      {normal ? (
        <Select label="Sensitivity" value={spreads} options={SENSITIVITY} onChange={(v) => set("threshold")(Number(v))} />
      ) : (
        <Field label="Threshold" type="number" step="any" required value={r.threshold} onChange={(e) => set("threshold")(Number(e.target.value))} />
      )}
    </>
  );
}

export const EMPTY_RULE: RuleDraft = {
  name: "",
  metric: "error_rate",
  metricName: "",
  metricStat: "",
  metricService: "",
  op: ">",
  threshold: 5,
  windowMs: 300_000,
  env: "",
  channels: [],
  enabled: true,
};

/** New or changed rule: what to watch, when it fires, and where the notice goes. */
export function AlertForm({ initial, onSave, onCancel }: { initial: RuleDraft; onSave: (r: RuleDraft) => Promise<string | null>; onCancel: () => void }) {
  const [r, setR] = useState(initial);
  const [channel, setChannel] = useState<Channel>(initial.channels[0] ?? { kind: "slack", url: "" });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => setR((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const metric = r.metric === "metric" ? { metricStat: r.metricStat || "avg" } : { metricName: "", metricStat: "", metricService: "" };
    const used = channel.kind === "email" ? channel.to.length > 0 : channel.url !== "";
    void onSave({ ...r, ...metric, channels: used ? [channel] : [] } as RuleDraft).then(setError);
  };
  return (
    <Panel title={initial.name ? `Edit "${initial.name}"` : "New alert"}>
      <form className="wl-form" onSubmit={submit}>
        <FormRow>
          <Field label="Name" required value={r.name} onChange={(e) => set("name")(e.target.value)} placeholder="Checkout errors" />
          <Field label="Environment (optional)" value={r.env} onChange={(e) => set("env")(e.target.value)} placeholder="All" />
        </FormRow>
        <FormRow>
          <Select label="Metric" value={r.metric} options={METRICS} onChange={(m) => (set("metric")(m), !isAnomalyMetric(m) && r.op === "above_normal" && set("op")(">"))} />
          <LineFields r={r} set={set} />
          <Select label="Over the last" value={String(r.windowMs)} options={WINDOWS} onChange={(v) => set("windowMs")(Number(v))} />
        </FormRow>
        {r.metric === "metric" && <MetricRuleFields r={r} set={set} />}
        {r.op === "above_normal" && (
          <p className="wl-muted wl-small">Fires when any service or endpoint is above its normal: the same window at the same time in earlier weeks (or days, on hosts that keep less). The notice names it and links to its problem.</p>
        )}
        <ChannelFields channel={channel} onChange={setChannel} />
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <FormRow>
          <button type="submit" className="wl-btn wl-btn-primary">Save alert</button>
          <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
        </FormRow>
      </form>
    </Panel>
  );
}
