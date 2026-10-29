import { type FormEvent, useState } from "react";
import { Plus, X } from "lucide-react";
import { type DashChartType, type DashPanel, MAX_PANEL_METRICS } from "@wizeworks/lens-core";
import { useMetricDetails } from "../../data/metricDetails";
import { useMetricsModel } from "../../data/metrics";
import { Field, FormRow, SelectField } from "../../ui/Field";
import { Panel } from "../../ui/Panel";

const TYPES: [DashChartType, string][] = [["line", "Lines"], ["area", "Areas"], ["bar", "Stacked bars"], ["number", "Numbers"], ["table", "Table"]];
const STATS: [string, string][] = [["", "Default"], ["p50", "p50"], ["p95", "p95"], ["p99", "p99"], ["avg", "Average"]];
const WIDTHS: [string, string][] = [["1", "Half width"], ["2", "Full width"]];
const NAMES_ID = "wl-dash-metric-names";

export const EMPTY_PANEL: DashPanel = { id: "", title: "", type: "line", metrics: [{ name: "", stat: "" }], where: "", group: "", width: 1 };

/** Split and filter choices: the first metric's attribute keys and their values. */
function FilterFields({ p, set }: { p: DashPanel; set: (x: Partial<DashPanel>) => void }) {
  const first = p.metrics.filter((m) => m.name).slice(0, 1);
  const { details } = useMetricDetails(first, "", "");
  const d = details[0];
  const keys = d ? Object.keys(d.values) : [];
  const [key, setKey] = useState("");
  const add = (value: string) => set({ where: [...p.where.split(",").filter(Boolean), `${key}=${value}`].join(",") });
  return (
    <FormRow>
      <SelectField label="Split lines by" value={p.group} options={[["", "Nothing (one line per series)"], ...(d?.groupKeys ?? []).map((k): [string, string] => [k, `By ${k}`])]} onChange={(g) => set({ group: g })} />
      <SelectField label="Filter key" value={key} options={[["", "Filter by…"], ...keys.map((k): [string, string] => [k, k])]} onChange={setKey} />
      {key && <SelectField label="Filter value" value="" options={[["", "Pick a value…"], ...(d?.values[key] ?? []).map((v): [string, string] => [v, v])]} onChange={(v) => v && (add(v), setKey(""))} />}
      <Field label="Only (key=value, comma-separated)" value={p.where} onChange={(e) => set({ where: e.target.value })} placeholder="All series" />
    </FormRow>
  );
}

/** One chart's settings: its title, metrics (up to six), how it is drawn, its filter and split, and its width. */
export function PanelEditor({ initial, onSave, onCancel }: { initial: DashPanel; onSave: (p: DashPanel) => void; onCancel: () => void }) {
  const [p, setP] = useState(initial);
  const { model } = useMetricsModel({ metric: "" });
  const set = (x: Partial<DashPanel>) => setP((c) => ({ ...c, ...x }));
  const setMetric = (i: number, m: Partial<DashPanel["metrics"][number]>) => set({ metrics: p.metrics.map((x, j) => (j === i ? { ...x, ...m } : x)) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ ...p, metrics: p.metrics.filter((m) => m.name.trim()) });
  };
  return (
    <Panel title={initial.id ? "Edit chart" : "New chart"} className="wl-dash-wide">
      <form className="wl-form" onSubmit={submit}>
        <FormRow>
          <Field label="Title (optional)" value={p.title} onChange={(e) => set({ title: e.target.value })} placeholder="CPU by service" />
          <SelectField label="Draw as" value={p.type} options={TYPES} onChange={(t) => set({ type: t })} />
          <SelectField label="Width" value={String(p.width)} options={WIDTHS} onChange={(w) => set({ width: w === "2" ? 2 : 1 })} />
        </FormRow>
        {p.metrics.map((m, i) => (
          <FormRow key={i}>
            <Field label={`Metric ${i + 1}`} required list={NAMES_ID} value={m.name} onChange={(e) => setMetric(i, { name: e.target.value })} placeholder="process.cpu.utilization" />
            <SelectField label="Statistic" value={m.stat} options={STATS} onChange={(s) => setMetric(i, { stat: s as DashPanel["metrics"][number]["stat"] })} />
            {p.metrics.length > 1 && <button type="button" className="wl-icon-btn" aria-label="Remove this metric" onClick={() => set({ metrics: p.metrics.filter((_, j) => j !== i) })}><X size={16} /></button>}
          </FormRow>
        ))}
        {p.metrics.length < MAX_PANEL_METRICS && <button type="button" className="wl-btn wl-btn-sm" onClick={() => set({ metrics: [...p.metrics, { name: "", stat: "" }] })}><Plus aria-hidden="true" /> Add a metric</button>}
        <datalist id={NAMES_ID}>{model?.catalog.map((c) => <option key={c.name} value={c.name}>{c.lastText}</option>)}</datalist>
        <FilterFields p={p} set={set} />
        <FormRow>
          <button type="submit" className="wl-btn wl-btn-primary">Save chart</button>
          <button type="button" className="wl-btn" onClick={onCancel}>Cancel</button>
        </FormRow>
      </form>
    </Panel>
  );
}
