import { type FormEvent, useState } from "react";
import { ALERT_METRICS, type AlertMetric, type AlertOp } from "@wizeworks/lens-core";
import { Select } from "../../ui/Controls";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { type AlertRule, type Channel, WINDOWS } from "./alertTypes";
import { ChannelFields } from "./ChannelFields";
import { LogRuleFields } from "./LogRuleFields";
import { MetricRuleFields } from "./MetricRuleFields";

export type RuleDraft = Omit<AlertRule, "id" | "state" | "lastValue" | "lastEvalMs">;

const METRICS: [AlertMetric | "metric", string][] = [
  ...Object.entries(ALERT_METRICS).map(([k, m]): [AlertMetric, string] => [k as AlertMetric, `${m.label}${m.unit ? ` (${m.unit})` : ""}`]),
  ["metric", "A metric (CPU, memory, your own)"],
];
const OPS: [AlertOp, string][] = [
  [">", "is above"],
  ["<", "is below"],
];

export const EMPTY_RULE: RuleDraft = {
  name: "",
  metric: "error_rate",
  metricName: "",
  metricStat: "",
  metricService: "",
  logSearch: {},
  op: ">",
  threshold: 5,
  windowMs: 300_000,
  env: "",
  channels: [],
  enabled: true,
};

/** New or changed rule: what to watch, when it fires, and where the notice goes. */
export function AlertForm({ initial, isNew = false, onSave, onCancel }: { initial: RuleDraft; isNew?: boolean; onSave: (r: RuleDraft) => Promise<string | null>; onCancel: () => void }) {
  const [r, setR] = useState(initial);
  const [channel, setChannel] = useState<Channel>(initial.channels[0] ?? { kind: "slack", url: "" });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => setR((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const metric = r.metric === "metric" ? { metricStat: r.metricStat || "avg", logSearch: {} } : { metricName: "", metricStat: "", metricService: "", ...(r.metric === "log_count" ? {} : { logSearch: {} }) };
    const used = channel.kind === "email" ? channel.to.length > 0 : channel.url !== "";
    void onSave({ ...r, ...metric, channels: used ? [channel] : [] } as RuleDraft).then(setError);
  };
  return (
    <Panel title={initial.name && !isNew ? `Edit "${initial.name}"` : "New alert"}>
      <form className="wl-form" onSubmit={submit}>
        <FormRow>
          <Field label="Name" required value={r.name} onChange={(e) => set("name")(e.target.value)} placeholder="Checkout errors" />
          <Field label="Environment (optional)" value={r.env} onChange={(e) => set("env")(e.target.value)} placeholder="All" />
        </FormRow>
        <FormRow>
          <Select label="Metric" value={r.metric} options={METRICS} onChange={set("metric")} />
          <Select label="Condition" value={r.op} options={OPS} onChange={set("op")} />
          <Field label="Threshold" type="number" step="any" required value={r.threshold} onChange={(e) => set("threshold")(Number(e.target.value))} />
          <Select label="Over the last" value={String(r.windowMs)} options={WINDOWS} onChange={(v) => set("windowMs")(Number(v))} />
        </FormRow>
        {r.metric === "metric" && <MetricRuleFields r={r} set={set} />}
        {r.metric === "log_count" && <LogRuleFields search={r.logSearch ?? {}} onChange={set("logSearch")} />}
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
