import { type FormEvent, useState } from "react";
import { ALERT_METRICS, type AlertMetric, type AlertOp } from "@wizeworks/lens-core";
import { Select } from "../../ui/Controls";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";
import { type AlertRule, type Channel, WINDOWS } from "./alertTypes";

export type RuleDraft = Omit<AlertRule, "id" | "state" | "lastValue" | "lastEvalMs">;

const METRICS = Object.entries(ALERT_METRICS).map(([k, m]): [AlertMetric, string] => [k as AlertMetric, `${m.label}${m.unit ? ` (${m.unit})` : ""}`]);
const OPS: [AlertOp, string][] = [
  [">", "is above"],
  ["<", "is below"],
];
const KINDS: [Channel["kind"], string][] = [
  ["webhook", "Webhook (JSON)"],
  ["slack", "Slack incoming webhook"],
];

export const EMPTY_RULE: RuleDraft = { name: "", metric: "error_rate", op: ">", threshold: 5, windowMs: 300_000, env: "", channels: [], enabled: true };

/** New or changed rule: what to watch, when it fires, and where the notice goes. */
export function AlertForm({ initial, onSave, onCancel }: { initial: RuleDraft; onSave: (r: RuleDraft) => Promise<string | null>; onCancel: () => void }) {
  const [r, setR] = useState(initial);
  const [channel, setChannel] = useState<Channel>(initial.channels[0] ?? { kind: "slack", url: "" });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RuleDraft>(k: K) => (v: RuleDraft[K]) => setR((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSave({ ...r, channels: channel.url ? [channel] : [] }).then(setError);
  };
  return (
    <Panel title={initial.name ? `Edit "${initial.name}"` : "New alert"}>
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
        <FormRow>
          <Select label="Send to" value={channel.kind} options={KINDS} onChange={(kind) => setChannel((c) => ({ ...c, kind }))} />
          <Field label="URL" type="url" value={channel.url} onChange={(e) => setChannel((c) => ({ ...c, url: e.target.value }))} placeholder="https://hooks.slack.com/services/…" />
        </FormRow>
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <FormRow>
          <button type="submit" className="wl-btn wl-btn-primary">Save alert</button>
          <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
        </FormRow>
      </form>
    </Panel>
  );
}
