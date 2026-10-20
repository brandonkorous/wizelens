import { type FormEvent, useState } from "react";
import { BellPlus, Save } from "lucide-react";
import { cleanSearchParams, logSearchText } from "@wizeworks/lens-core";
import { useHost } from "../../data/host";
import { useLogCharts } from "../../data/logCharts";
import { useRoute } from "../../routes";
import { Check, Field } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { alertHref, SavedSearchChart } from "./SavedSearchChart";

/** Name and save the Logs page's current filters as a saved search drawn as a chart. */
function SaveForm({ params, cloud, onSave, onDone }: { params: Record<string, string>; cloud: boolean; onSave: (name: string, shared: boolean) => Promise<string | null>; onDone: () => void }) {
  const [name, setName] = useState(logSearchText(params).slice(0, 100));
  const [shared, setShared] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSave(name, shared).then((err) => (err ? setError(err) : onDone()));
  };
  return (
    <form className="wl-log-save" onSubmit={submit}>
      <Field label="Search name" required maxLength={100} value={name} placeholder="Checkout timeouts" onChange={(e) => setName(e.target.value)} autoFocus />
      {cloud && <Check label="Share with the team" checked={shared} onChange={(e) => setShared(e.target.checked)} />}
      <button type="submit" className="wl-btn wl-btn-primary">Save</button>
      <button type="button" className="wl-btn" onClick={onDone}>Cancel</button>
      {error && <span className="wl-text-error wl-small">{error}</span>}
    </form>
  );
}

/** Log metrics: each saved log search as a chart of its lines over the time range. */
export function LogMetricsPanel() {
  const { charts, error, canWrite, save, remove } = useLogCharts();
  const params = cleanSearchParams(Object.fromEntries(useRoute().query));
  const host = useHost();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const drop = (id: string) => void remove(id).then(setNote);
  const action = (
    <span className="wl-row-actions">
      {host.has("alerts") && <a href={alertHref(params)}><BellPlus aria-hidden="true" /> Alert on this search</a>}
      {canWrite && !saving && <button type="button" className="wl-link-btn" onClick={() => setSaving(true)}><Save aria-hidden="true" /> Save this search</button>}
    </span>
  );
  return (
    <Panel title="Log Metrics" action={action} className="wl-log-metrics">
      {saving && <SaveForm params={params} cloud={host.has("accounts")} onSave={(name, shared) => save(name, params, shared)} onDone={() => setSaving(false)} />}
      {(error ?? note) && <div className="wl-banner wl-banner-error">{error ?? note}</div>}
      {charts.length === 0 ? (
        <Empty title="No saved searches yet">Filter the lines below, then save the search to chart how many lines match it over time.</Empty>
      ) : (
        <div className="wl-log-metric-grid">
          {charts.map((c) => <SavedSearchChart key={c.item.id} name={c.item.name} params={c.params} onDelete={canWrite ? () => drop(c.item.id) : undefined} />)}
        </div>
      )}
    </Panel>
  );
}
