import { type FormEvent, useState } from "react";
import type { SloInput } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { Select } from "../../ui/Controls";
import { Field, FormRow } from "../../ui/Field";
import { Panel } from "../../ui/Panel";

export const EMPTY_SLO: SloInput = { name: "", service: "", endpoint: "", kind: "success", target: 99.9, thresholdMs: 500, windowDays: 30 };

const KINDS: [SloInput["kind"], string][] = [["success", "Requests succeed"], ["latency", "Requests are fast enough"]];
const WINDOWS: [string, string][] = [["30", "Over 30 days"], ["7", "Over 7 days"]];

/** Names of the services that run your code, for the service field. */
function useServiceNames(): string[] {
  const { model } = usePageModel("services");
  return [...new Set((model?.rows ?? []).filter((s) => s.kind === "api" || s.kind === "worker" || s.kind === "web").map((s) => s.name))];
}

/** New or changed SLO: what counts as good, the target, and the window. */
export function SloForm({ initial, title, onSave, onCancel }: { initial: SloInput; title: string; onSave: (s: SloInput) => Promise<string | null>; onCancel: () => void }) {
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const names = useServiceNames();
  const set = <K extends keyof SloInput>(k: K) => (v: SloInput[K]) => setS((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSave(s).then(setError);
  };
  return (
    <Panel title={title}>
      <form className="wl-form" onSubmit={submit}>
        <FormRow>
          <Field label="Name (optional)" value={s.name} onChange={(e) => set("name")(e.target.value)} placeholder="Checkout availability" />
          <Field label="Service" required list="wl-slo-services" value={s.service} onChange={(e) => set("service")(e.target.value)} placeholder="orders" />
          <Field label="Endpoint (optional)" value={s.endpoint} onChange={(e) => set("endpoint")(e.target.value)} placeholder="All endpoints, or GET /api/orders/{id}" />
          <datalist id="wl-slo-services">
            {names.map((n) => <option key={n} value={n} />)}
          </datalist>
        </FormRow>
        <FormRow>
          <Select label="Good means" value={s.kind} options={KINDS} onChange={set("kind")} />
          {s.kind === "latency" && <Field label="Within (ms)" type="number" min={1} required value={s.thresholdMs} onChange={(e) => set("thresholdMs")(Number(e.target.value))} />}
          <Field label="Target (%)" type="number" step="any" min={0} max={99.999} required value={s.target} onChange={(e) => set("target")(Number(e.target.value))} />
          <Select label="Window" value={String(s.windowDays)} options={WINDOWS} onChange={(v) => set("windowDays")(Number(v) as 7 | 30)} />
        </FormRow>
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <FormRow>
          <button type="submit" className="wl-btn wl-btn-primary">Save SLO</button>
          <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
        </FormRow>
      </form>
    </Panel>
  );
}
