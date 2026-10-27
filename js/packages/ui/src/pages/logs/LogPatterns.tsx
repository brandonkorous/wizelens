import type { LogPatternRow } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { fmtCount } from "../../format";
import { setQuery, useRoute } from "../../routes";
import { Badge } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { Sparkline } from "../../ui/Sparkline";
import { type Column, Table } from "../../ui/Table";
import { LevelBadge } from "./LogParts";

/** Change against the window before: more lines read as worse; a pattern with none before is new. */
function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <Badge tone="info">New</Badge>;
  const text = `${pct > 0 ? "+" : ""}${Math.round(pct)}%`;
  return <span className={pct > 10 ? "wl-text-error" : pct < -10 ? "wl-text-ok" : "wl-muted"}>{text}</span>;
}

const COLUMNS: Column<LogPatternRow>[] = [
  { key: "pattern", header: "Pattern", className: "wl-log-pattern", cell: (r) => <code title={r.sample}>{r.pattern || "(empty message)"}</code> },
  { key: "level", header: "Level", cell: (r) => <LevelBadge level={r.level} /> },
  { key: "services", header: "Services", className: "wl-log-cat", cell: (r) => <span className="wl-truncate" title={r.services.join(", ")}>{r.services.join(", ")}</span> },
  { key: "count", header: "Lines", num: true, sort: (r) => r.count, cell: (r) => fmtCount(r.count) },
  { key: "share", header: "Share", num: true, sort: (r) => r.share, cell: (r) => <span className="wl-log-share"><span style={{ width: `${Math.max(2, r.share)}%` }} /></span> },
  { key: "change", header: "Change", num: true, sort: (r) => r.change ?? Infinity, cell: (r) => <Change pct={r.change} /> },
  { key: "trend", header: "Trend", cell: (r) => <Sparkline values={r.series} width={96} height={26} /> },
];

/** Similar lines grouped, with numbers and ids masked. A click filters the Logs page to one pattern. */
export function LogPatternsPanel() {
  const { model } = usePageModel("log-patterns");
  const route = useRoute().query;
  const active = route.get("pattern") ?? "";
  if (!model) return null;
  // Patterns come from a rollup by service, level and shape, so search text cannot narrow them.
  if (route.get("q"))
    return (
      <Panel title="Log Patterns">
        <p className="wl-muted wl-small">Patterns follow the level and service filters, not search text. The lines that match are below.</p>
      </Panel>
    );
  const clear = active && (
    <button type="button" className="wl-link-btn" onClick={() => setQuery({ pattern: null, page: null })}>
      Show every pattern
    </button>
  );
  const title = `Log Patterns (${fmtCount(model.total)})`;
  return (
    <Panel title={title} action={clear} flush className="wl-log-patterns">
      <Table
        columns={COLUMNS}
        rows={model.rows}
        served={{ info: model.paging, noun: "patterns" }}
        rowKey={(r) => r.id}
        selectedKey={active || null}
        onRowClick={(r) => setQuery({ pattern: r.id === active ? null : r.id, page: null })}
        empty={<Empty title="No patterns">Patterns follow the level and service filters, and need log lines in this time range.</Empty>}
      />
    </Panel>
  );
}
