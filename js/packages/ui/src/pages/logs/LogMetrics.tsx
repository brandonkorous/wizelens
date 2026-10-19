import { type FormEvent, useState } from "react";
import { BellPlus, Save } from "lucide-react";
import { cleanSearchParams, logSearchText } from "@wizeworks/lens-core";
import { useHost } from "../../data/host";
import { useSavedSearches } from "../../data/savedSearches";
import { useRoute } from "../../routes";
import { Field } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { alertHref, SavedSearchChart } from "./SavedSearchChart";

/** Name and save the Logs page's current filters. */
function SaveForm({ params, onSave, onDone }: { params: Record<string, string>; onSave: (name: string) => Promise<string | null>; onDone: () => void }) {
  const [name, setName] = useState(logSearchText(params).slice(0, 100));
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSave(name).then((err) => (err ? setError(err) : onDone()));
  };
  return (
    <form className="wl-log-save" onSubmit={submit}>
      <Field label="Search name" required maxLength={100} value={name} placeholder="Checkout timeouts" onChange={(e) => setName(e.target.value)} autoFocus />
      <button type="submit" className="wl-btn wl-btn-primary">Save</button>
      <button type="button" className="wl-btn" onClick={onDone}>Cancel</button>
      {error && <span className="wl-text-error wl-small">{error}</span>}
    </form>
  );
}

/** Log metrics: each saved log search as a chart of its lines over the time range. */
export function LogMetricsPanel() {
  const { searches, error, save, remove } = useSavedSearches();
  const params = cleanSearchParams(Object.fromEntries(useRoute().query));
  const alerts = useHost().has("alerts");
  const [saving, setSaving] = useState(false);
  const action = (
    <span className="wl-row-actions">
      {alerts && <a href={alertHref(params)}><BellPlus aria-hidden="true" /> Alert on this search</a>}
      {!saving && <button type="button" className="wl-link-btn" onClick={() => setSaving(true)}><Save aria-hidden="true" /> Save this search</button>}
    </span>
  );
  return (
    <Panel title="Log Metrics" action={action} className="wl-log-metrics">
      {saving && <SaveForm params={params} onSave={(name) => save(name, params)} onDone={() => setSaving(false)} />}
      {error && <div className="wl-banner wl-banner-error">{error}</div>}
      {searches.length === 0 ? (
        <Empty title="No saved searches yet">Filter the lines below, then save the search to chart how many lines match it over time.</Empty>
      ) : (
        <div className="wl-log-metric-grid">
          {searches.map((s) => <SavedSearchChart key={s.id} search={s} onDelete={() => void remove(s.id)} />)}
        </div>
      )}
    </Panel>
  );
}
