import { type FormEvent, useState } from "react";
import { ALERT_METRICS, type AlertMetric, type AlertOp, type AlertRuleInput } from "@wizeworks/lens-core";
import { Select } from "../../ui/Controls";
import { Check, Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { REMINDS, WINDOWS } from "./alertTypes";
import { ChannelFields } from "./ChannelFields";
import { MetricRuleFields } from "./MetricRuleFields";
import { ScopeFields } from "./ScopeFields";
import { SloFields } from "./SloFields";

export type RuleDraft = AlertRuleInput;

const METRICS: [RuleDraft["metric"], string][] = [
  ...Object.entries(ALERT_METRICS).map(([k, m]): [AlertMetric, string] => [k as AlertMetric, `${m.label}${m.unit ? ` (${m.unit})` : ""}`]),
  ["metric", "A metric (CPU, memory, your own)"],
  ["slo", "An SLO's burn rate (×)"],
];
const OPS: [AlertOp, string][] = [
  [">", "is above"],
  [">=", "is at or above"],
  ["<", "is below"],
  ["<=", "is at or below"],
];

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
  service: "",
  endpoint: "",
  channels: [],
  enabled: true,
  remindMs: 0,
  sloId: "",
};

/** Only the fields a rule keeps, from a draft or a kept rule. */
export const draftOf = (r: RuleDraft): RuleDraft => Object.fromEntries(Object.keys(EMPTY_RULE).map((k) => [k, r[k as keyof RuleDraft]])) as unknown as RuleDraft;

/** The draft ready to send: metric rules drop the scope, trace rules drop the metric fields, and empty channels go. */
function cleaned(r: RuleDraft): RuleDraft {
  const none = { metricName: "", metricStat: "" as const, metricService: "" };
  const metric =
    r.metric === "metric" ? { metricStat: r.metricStat || "avg", service: "", endpoint: "", sloId: "" } : r.metric === "slo" ? { ...none, service: "", endpoint: "" } : { ...none, sloId: "", endpoint: r.service ? r.endpoint : "" };
  const channels = r.channels.filter((c) => (c.kind === "email" ? c.to.length > 0 : c.kind === "pagerduty" ? c.routingKey.trim() !== "" : c.url.trim() !== ""));
  return { ...draftOf(r), ...metric, channels };
}

/** New or changed rule: what to watch, when it fires, how often it reminds, and where notices go. */
export function AlertForm({ initial, title, onSave, onCancel }: { initial: RuleDraft; title: string; onSave: (r: RuleDraft) => Promise<string | null>; onCancel: () => void }) {
  const [r, setR] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => setR((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSave(cleaned(r)).then(setError);
  };
  return (
    <Panel title={title}>
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
        {r.metric === "metric" ? <MetricRuleFields r={r} set={set} /> : r.metric === "slo" ? <SloFields r={r} set={set} /> : <ScopeFields r={r} set={set} />}
        <FormRow>
          <Select label="Remind while firing" value={String(r.remindMs)} options={REMINDS} onChange={(v) => set("remindMs")(Number(v))} />
          <Check label="On" checked={r.enabled} onChange={(e) => set("enabled")(e.target.checked)} />
        </FormRow>
        <ChannelFields channels={r.channels} onChange={set("channels")} />
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <FormRow>
          <button type="submit" className="wl-btn wl-btn-primary">Save alert</button>
          <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
        </FormRow>
      </form>
    </Panel>
  );
}
