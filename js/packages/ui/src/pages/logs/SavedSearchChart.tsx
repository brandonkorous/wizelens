import { BellPlus, Search, Trash2 } from "lucide-react";
import { LOG_SEARCH_PARAMS, logSearchText, type SavedSearch } from "@wizeworks/lens-core";
import { useHost } from "../../data/host";
import { usePageModelOf } from "../../data/models";
import { fmtCount } from "../../format";
import { hrefTo, setQuery } from "../../routes";
import { TimeChart } from "../../ui/TimeChart";

/** Every log filter cleared, then the saved search's filters set: what "Show lines" puts in the address. */
export const searchQuery = (params: Record<string, string>): Record<string, string | null> => ({
  ...Object.fromEntries(LOG_SEARCH_PARAMS.map((k) => [k, null])),
  trace: null,
  page: null,
  ...params,
});

/** The Alerts page with a new log count rule for these filters. */
export const alertHref = (params: Record<string, string>) => hrefTo("alerts", [], { new: "1", log: JSON.stringify(params) });

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return <span className={pct > 10 ? "wl-text-error" : pct < -10 ? "wl-text-ok" : "wl-muted"}>{`${pct > 0 ? "+" : ""}${Math.round(pct)}%`}</span>;
}

/** One saved log search as a chart: its matching lines per bucket, errors on top, and its total against the window before. */
export function SavedSearchChart({ search, onDelete }: { search: SavedSearch; onDelete: () => void }) {
  const { model } = usePageModelOf("log-chart", search.params);
  const alerts = useHost().has("alerts");
  const bars = model ? [{ label: "Lines", color: "var(--wl-chart-bar)", values: model.lines.map((n, i) => (n ?? 0) - (model.errors[i] ?? 0)) }, { label: "Errors", color: "var(--wl-red)", values: model.errors }] : [];
  return (
    <article className="wl-log-metric">
      <header>
        <div className="wl-log-metric-title">
          <strong className="wl-truncate">{search.name}</strong>
          <span className="wl-muted wl-small wl-truncate">{logSearchText(search.params) || "Every line"}</span>
        </div>
        <div className="wl-log-metric-total">
          <strong>{model ? fmtCount(model.total) : "–"}</strong> {model && <Change pct={model.change} />}
        </div>
      </header>
      {model && <TimeChart starts={model.starts} bars={bars} height={120} stackBars />}
      <footer className="wl-row-actions">
        <button type="button" className="wl-link-btn" onClick={() => setQuery(searchQuery(search.params))}><Search aria-hidden="true" /> Show lines</button>
        {alerts && <a href={alertHref(search.params)}><BellPlus aria-hidden="true" /> Alert</a>}
        <button type="button" className="wl-link-btn wl-text-error" onClick={onDelete}><Trash2 aria-hidden="true" /> Delete</button>
      </footer>
    </article>
  );
}
