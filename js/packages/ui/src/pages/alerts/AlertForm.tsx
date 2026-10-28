import { type FormEvent, type ReactNode, useState } from "react";
import { ALERT_METRICS, type AlertMetric, type AlertRuleInput, isAnomalyMetric } from "@wizeworks/lens-core";
import { Select } from "../../ui/Controls";
import { Check, Field, FormRow } from "../../ui/Field";
import { Modal } from "../../ui/Modal";
import { useOnce } from "../../ui/useOnce";
import { METRIC_HINTS, REMINDS, WINDOWS } from "./alertTypes";
import { ChannelFields } from "./ChannelFields";
import { AboveNormalNote, LineFields } from "./LineFields";
import { LogRuleFields } from "./LogRuleFields";
import { MetricRuleFields } from "./MetricRuleFields";
import { ScopeFields } from "./ScopeFields";
import { SloFields } from "./SloFields";

export type RuleDraft = AlertRuleInput;

const METRICS: [RuleDraft["metric"], string][] = [
  ...Object.entries(ALERT_METRICS).map(([k, m]): [AlertMetric, string] => [k as AlertMetric, `${m.label}${m.unit ? ` (${m.unit})` : ""}`]),
  ["metric", "A metric (CPU, memory, your own)"],
  ["slo", "An SLO's burn rate (×)"],
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
  logSearch: {},
};

/** Only the fields a rule keeps, from a draft or a kept rule. */
export const draftOf = (r: RuleDraft): RuleDraft => Object.fromEntries(Object.keys(EMPTY_RULE).map((k) => [k, r[k as keyof RuleDraft]])) as unknown as RuleDraft;

/** The draft ready to send: metric rules drop the scope, trace rules drop the metric fields, and empty channels go. Submit stops an email channel with no member first. */
function cleaned(r: RuleDraft): RuleDraft {
  const none = { metricName: "", metricStat: "" as const, metricService: "" };
  const metric =
    r.metric === "metric" ? { metricStat: r.metricStat || "avg", service: "", endpoint: "", sloId: "" } : r.metric === "slo" ? { ...none, service: "", endpoint: "" } : { ...none, sloId: "", endpoint: r.service ? r.endpoint : "" };
  const channels = r.channels.filter((c) => (c.kind === "email" ? c.to.length > 0 : c.kind === "pagerduty" ? c.routingKey.trim() !== "" : c.url.trim() !== ""));
  const logs = r.metric === "log_count" ? { service: "", endpoint: "", logSearch: r.logSearch ?? {} } : r.metric === "uptime_failing" ? { service: "", endpoint: "", logSearch: {} } : { logSearch: {} };
  return { ...draftOf(r), ...metric, ...logs, channels };
}

/** New or changed rule: what to watch, when it fires, how often it reminds, and where notices go. */
export function AlertForm({ initial, title, lead, onSave, onCancel }: { initial: RuleDraft; title: string; lead?: ReactNode; onSave: (r: RuleDraft) => Promise<string | null>; onCancel: () => void }) {
  const [r, setR] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const { busy, once } = useOnce();
  const set = <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => setR((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (r.channels.some((c) => c.kind === "email" && c.to.length === 0)) return setError("Tick at least one member under “Email to members”, or remove that channel.");
    once(() => onSave(cleaned(r)).then(setError));
  };
  return (
    <Modal title={title} onClose={onCancel} wide>
      <form className="wl-form" onSubmit={submit}>
        {lead}
        <FormRow>
          <Field label="Name" required value={r.name} onChange={(e) => set("name")(e.target.value)} placeholder="Checkout errors" />
          <Field label="Environment (optional)" value={r.env} onChange={(e) => set("env")(e.target.value)} placeholder="All" />
        </FormRow>
        <FormRow>
          <Select label="Metric" value={r.metric} options={METRICS} onChange={(m) => (set("metric")(m), !isAnomalyMetric(m) && r.op === "above_normal" && set("op")(">"))} />
          <LineFields r={r} set={set} />
          <Select label="Over the last" value={String(r.windowMs)} options={WINDOWS} onChange={(v) => set("windowMs")(Number(v))} />
        </FormRow>
        {METRIC_HINTS[r.metric] && <p className="wl-muted wl-small">{METRIC_HINTS[r.metric]}</p>}
        {r.op === "above_normal" && <AboveNormalNote />}
        {r.metric === "metric" ? <MetricRuleFields r={r} set={set} /> : r.metric === "slo" ? <SloFields r={r} set={set} /> : r.metric === "log_count" ? <LogRuleFields search={r.logSearch ?? {}} onChange={set("logSearch")} /> : r.metric === "uptime_failing" ? null : <ScopeFields r={r} set={set} />}
        <FormRow>
          <Select label="Remind while firing" value={String(r.remindMs)} options={REMINDS} onChange={(v) => set("remindMs")(Number(v))} />
          <Check label="On" checked={r.enabled} onChange={(e) => set("enabled")(e.target.checked)} />
        </FormRow>
        <ChannelFields channels={r.channels} onChange={set("channels")} />
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <div className="wl-form-actions">
          <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="wl-btn wl-btn-primary" disabled={busy}>Save alert</button>
        </div>
      </form>
    </Modal>
  );
}
