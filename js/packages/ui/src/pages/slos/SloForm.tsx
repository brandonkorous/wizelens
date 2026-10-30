import { type FormEvent, type ReactNode, useState } from "react";
import { useOnce } from "../../ui/useOnce";
import type { SloInput } from "@wizeworks/lens-core/internal";
import { usePageModel } from "../../data/models";
import { Field, FormRow, SelectField } from "../../ui/Field";
import { Modal } from "../../ui/Modal";

export const EMPTY_SLO: SloInput = { name: "", service: "", endpoint: "", kind: "success", target: 99.9, thresholdMs: 500, windowDays: 30 };

const KINDS: [SloInput["kind"], string][] = [["success", "Requests succeed"], ["latency", "Requests are fast enough"]];
const WINDOWS: [string, string][] = [["30", "Over 30 days"], ["7", "Over 7 days"]];

/** Names of the services that run your code, for the service field. */
function useServiceNames(): string[] {
  const { model } = usePageModel("services");
  return [...new Set((model?.rows ?? []).filter((s) => s.kind === "api" || s.kind === "worker" || s.kind === "web").map((s) => s.name))];
}

/** "43 min" or "7.2 h": how long a full outage the budget allows. */
const fmtOutage = (min: number): string => (min < 90 ? `${Math.round(min)} min` : `${(min / 60).toFixed(1)} h`);

/** What the target allows, in a person's terms: "0.1% of requests may fail: about 43 min of full outage in 30 days." */
export function budgetHint(s: Pick<SloInput, "kind" | "target" | "windowDays">): string | undefined {
  const spare = 100 - s.target;
  if (!(spare > 0 && spare < 100)) return undefined;
  const [bad, all] = s.kind === "latency" ? ["be slower", "every request slow"] : ["fail", "full outage"];
  return `${+spare.toFixed(3)}% of requests may ${bad}: about ${fmtOutage((spare / 100) * s.windowDays * 1440)} of ${all} in ${s.windowDays} days.`;
}

/** New or changed SLO, in its own window: what counts as good, the target, and the window. Fields sit in two even columns. */
export function SloForm({ initial, title, lead, onSave, onCancel }: { initial: SloInput; title: string; lead?: ReactNode; onSave: (s: SloInput) => Promise<string | null>; onCancel: () => void }) {
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const { busy, once } = useOnce();
  const names = useServiceNames();
  const set = <K extends keyof SloInput>(k: K) => (v: SloInput[K]) => setS((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    once(() => onSave(s).then(setError));
  };
  return (
    <Modal title={title} onClose={onCancel}>
      <form className="wl-form wl-slo-form" onSubmit={submit}>
        {lead && <FormRow half>{lead}</FormRow>}
        <FormRow half>
          <Field label="Service" required list="wl-slo-services" value={s.service} onChange={(e) => set("service")(e.target.value)} placeholder="orders" />
          <Field label="Name (optional)" value={s.name} onChange={(e) => set("name")(e.target.value)} placeholder="Checkout availability" />
        </FormRow>
        <datalist id="wl-slo-services">
          {names.map((n) => <option key={n} value={n} />)}
        </datalist>
        <FormRow>
          <Field label="Endpoint (optional)" value={s.endpoint} onChange={(e) => set("endpoint")(e.target.value)} placeholder="GET /api/orders/{id}" hint="Leave it empty to cover every endpoint of the service." />
        </FormRow>
        <FormRow half>
          <SelectField label="Good means" value={s.kind} options={KINDS} onChange={set("kind")} />
          {s.kind === "latency" && <Field label="Within (ms)" type="number" min={1} required value={s.thresholdMs} onChange={(e) => set("thresholdMs")(Number(e.target.value))} />}
        </FormRow>
        <FormRow half>
          <Field label="Target (%)" type="number" step="any" min={0} max={99.999} required value={s.target} onChange={(e) => set("target")(Number(e.target.value))} hint={budgetHint(s)} />
          <SelectField label="Window" value={String(s.windowDays)} options={WINDOWS} onChange={(v) => set("windowDays")(Number(v) as 7 | 30)} />
        </FormRow>
        {error && <div className="wl-banner wl-banner-error">{error}</div>}
        <div className="wl-form-actions">
          <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="wl-btn wl-btn-primary" disabled={busy}>Save SLO</button>
        </div>
      </form>
    </Modal>
  );
}
