import { useState } from "react";
import { Database } from "lucide-react";
import type { DatabaseModel, QueryRow, TableRow } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtShort, fmtShownOf } from "../../format";
import { navigate, traceHref } from "../../routes";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

const TOP = 5;

/** Endpoint label without the method: "/api/orders". */
const pathOf = (endpoint: string) => endpoint.replace(/^[A-Z]+ /, "");

function queryColumns(slowMs: number): Column<QueryRow>[] {
  return [
    { key: "query", header: "Query", className: "wl-db-query", cell: (q) => <span className="wl-truncate" title={q.query}>{q.query}</span> },
    { key: "avg", header: "Avg Duration", sort: (q) => q.avgMs, cell: (q) => <span className={q.avgMs >= slowMs ? "wl-text-error" : undefined}>{fmtMs(q.avgMs)}</span> },
    { key: "count", header: "Frequency", sort: (q) => q.count, cell: (q) => fmtCount(q.count) },
    { key: "endpoint", header: "Endpoint", cell: (q) => <span className="wl-path-chip" title={q.endpoints.join("\n")}>{pathOf(q.endpoints[0] ?? "")}</span> },
  ];
}

function ToggleAll({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
  if (total <= TOP) return null;
  return (
    <button type="button" className="wl-view-all wl-link-btn" onClick={onToggle}>
      {open ? `Show top ${TOP}` : `View all ${total}`}
    </button>
  );
}

export function TopQueriesPanel({ stats }: { stats: DatabaseModel }) {
  const [all, setAll] = useState(false);
  const rows = all ? stats.queries : stats.queries.slice(0, TOP);
  return (
    <Panel title={`Slowest Queries (${fmtShownOf(stats.queries.length, stats.queryShapes)})`} action={<ToggleAll open={all} total={stats.queries.length} onToggle={() => setAll(!all)} />}>
      <Table
        columns={queryColumns(stats.slowMs)}
        rows={rows}
        rowKey={(q) => q.key}
        onRowClick={(q) => navigate(traceHref(q.exampleTraceId, "sql"))}
        empty={<Empty>No queries in this time range.</Empty>}
      />
    </Panel>
  );
}

const TABLE_COLUMNS: Column<TableRow>[] = [
  { key: "table", header: "Table", cell: (t) => <span className="wl-cell-icon"><Database aria-hidden="true" />{t.table}</span> },
  { key: "queries", header: "Queries", num: true, sort: (t) => t.queries, cell: (t) => fmtCount(t.queries) },
  { key: "avg", header: "Avg Duration", num: true, sort: (t) => t.avgMs, cell: (t) => fmtMs(t.avgMs) },
  { key: "rows", header: "Rows Returned", num: true, sort: (t) => t.rows ?? -1, cell: (t) => (t.rows === null ? "–" : fmtShort(t.rows)) },
];

export function TableHotspotsPanel({ stats }: { stats: DatabaseModel }) {
  const [all, setAll] = useState(false);
  const rows = all ? stats.tables : stats.tables.slice(0, TOP);
  return (
    <Panel title={`Table Hotspots (${fmtShownOf(stats.tables.length, stats.tableCount)})`} action={<ToggleAll open={all} total={stats.tables.length} onToggle={() => setAll(!all)} />}>
      <Table columns={TABLE_COLUMNS} rows={rows} rowKey={(t) => t.table} empty={<Empty>No table names found in the queries.</Empty>} />
      <p className="wl-db-note">Rows returned come from the driver. Index use and rows scanned need query plans, which WizeLens does not run.</p>
    </Panel>
  );
}
