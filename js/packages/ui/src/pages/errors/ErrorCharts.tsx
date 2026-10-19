import { useState } from "react";
import { BarChart3 } from "lucide-react";
import type { ErrorsModel } from "@wizeworks/lens-core";
import { fmtCount } from "../../format";
import { setQuery } from "../../routes";
import { BarList } from "../../ui/BarList";
import { Empty, Panel } from "../../ui/Panel";
import { TimeChart } from "../../ui/TimeChart";

export function ErrorsOverTimePanel({ stats }: { stats: ErrorsModel }) {
  const { starts } = stats;
  const { plain, critical } = stats.chart;
  return (
    <Panel title="Errors Over Time">
      {stats.exceptions === 0 ? (
        <Empty title="No errors in this time range">
          <BarChart3 aria-hidden="true" />
        </Empty>
      ) : (
        <TimeChart
          starts={starts}
          stackBars
          bars={[
            { label: "Critical errors", values: critical, color: "var(--wl-red)" },
            { label: "Errors", values: plain, color: "color-mix(in srgb, var(--wl-red) 35%, transparent)" },
          ]}
        />
      )}
    </Panel>
  );
}

const TOP_TYPES = 5;

export function TopErrorTypesPanel({ stats }: { stats: ErrorsModel }) {
  const [all, setAll] = useState(false);
  const types = all ? stats.types : stats.types.slice(0, TOP_TYPES);
  const top = types[0]?.count ?? 0;
  const items = types.map((t) => ({
    key: t.type,
    label: t.type,
    value: t.count,
    display: fmtCount(t.count),
    color: t.count === top ? "var(--wl-red)" : "color-mix(in srgb, var(--wl-red) 50%, transparent)",
    onClick: () => setQuery({ type: t.type === stats.filter.type ? null : t.type, page: null, group: null }),
  }));
  const toggle = stats.types.length > TOP_TYPES && (
    <button type="button" className="wl-view-all wl-link-btn" onClick={() => setAll(!all)}>
      {all ? `Show top ${TOP_TYPES}` : `View all ${stats.types.length}`}
    </button>
  );
  return (
    <Panel title="Top Error Types" action={toggle}>
      {items.length === 0 ? <Empty>No exception types yet.</Empty> : <BarList items={items} />}
    </Panel>
  );
}
