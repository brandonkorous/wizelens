import { useState } from "react";
import { Database } from "lucide-react";
import type { DatabaseModel, QueryRow, TableRow } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtShort, fmtShownOf } from "../../format";
import { hrefTo, navigate, queryHref, setQuery } from "../../routes";
import { Pager } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { ExportButton } from "../../ui/ExportButton";

const TOP = 5;

/** Endpoint label without the method: "/api/orders". */
const pathOf = (endpoint: string) => endpoint.replace(/^[A-Z]+ /, "");

/** The first endpoint that ran the query, as a link to its requests; the rest in the tooltip. */
function EndpointLink({ q }: { q: QueryRow }) {
  const first = q.endpoints[0];
  if (!first) return <>–</>;
  const more = q.endpoints.length > 1 ? ` +${q.endpoints.length - 1}` : "";
  return (
    <a className="wl-path-chip" href={hrefTo("requests", [], { endpoint: first })} title={q.endpoints.join("\n")} onClick={(e) => e.stopPropagation()}>
      {pathOf(first)}
      {more}
    </a>
  );
}

const errorText = (n: number) => <span className={n ? "wl-text-error" : undefined}>{fmtCount(n)}</span>;

function queryColumns(slowMs: number): Column<QueryRow>[] {
  return [
    { key: "query", header: "Query", className: "wl-db-query", cell: (q) => <span className="wl-truncate" title={q.query}>{q.query}</span> },
    { key: "avg", header: "Avg", num: true, cell: (q) => <span className={q.avgMs >= slowMs ? "wl-text-error" : undefined}>{fmtMs(q.avgMs)}</span> },
    { key: "max", header: "Max", num: true, cell: (q) => fmtMs(q.maxMs) },
    { key: "count", header: "Count", num: true, cell: (q) => fmtCount(q.count) },
    { key: "total", header: "Total Time", num: true, cell: (q) => fmtMs(q.totalMs) },
    { key: "slow", header: "Slow", num: true, cell: (q) => errorText(q.slow) },
    { key: "errors", header: "Errors", num: true, cell: (q) => errorText(q.errors) },
    { key: "endpoint", header: "Endpoint", cell: (q) => <EndpointLink q={q} /> },
  ];
}

const QUERY_TITLE = { avg: "Slowest Queries", count: "Most Frequent Queries", total: "Queries by Total Time" } as const;

function ToggleAll({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
  if (total <= TOP) return null;
  return (
    <button type="button" className="wl-view-all wl-link-btn" onClick={onToggle}>
      {open ? `Show top ${TOP}` : `View all ${total}`}
    </button>
  );
}

/** One page of the query shapes that match the filter, in its order. A row opens the query's page. */
export function TopQueriesPanel({ stats }: { stats: DatabaseModel }) {
  return (
    <Panel title={`${QUERY_TITLE[stats.filter.sort]} (${fmtCount(stats.queryShapes)})`} flush className="wl-db-queries" action={<ExportButton page="database" disabled={stats.queries.length === 0} />}>
      <Table columns={queryColumns(stats.slowMs)} rows={stats.queries} rowKey={(q) => q.key} onRowClick={(q) => navigate(queryHref(q.query))} empty={<Empty>No queries match in this time range.</Empty>} />
      {stats.queryShapes > 0 && (
        <Pager page={stats.page} pageSize={stats.size} total={stats.queryShapes} noun="queries" onPage={(p) => setQuery({ page: p })} onPageSize={(s) => setQuery({ size: s, page: null })} />
      )}
    </Panel>
  );
}

const TABLE_COLUMNS: Column<TableRow>[] = [
  { key: "table", header: "Table", cell: (t) => <span className="wl-cell-icon"><Database aria-hidden="true" />{t.table}</span> },
  { key: "queries", header: "Queries", num: true, sort: (t) => t.queries, cell: (t) => fmtCount(t.queries) },
  { key: "avg", header: "Avg Duration", num: true, sort: (t) => t.avgMs, cell: (t) => fmtMs(t.avgMs) },
  { key: "rows", header: "Rows Returned", num: true, sort: (t) => t.rows ?? -1, cell: (t) => (t.rows === null ? "–" : fmtShort(t.rows)) },
];

/** Tables by queries. A row filters the query list by the table. */
export function TableHotspotsPanel({ stats }: { stats: DatabaseModel }) {
  const [all, setAll] = useState(false);
  const rows = all ? stats.tables : stats.tables.slice(0, TOP);
  const pick = (t: TableRow) => setQuery({ table: t.table === stats.filter.table ? null : t.table, page: null });
  return (
    <Panel title={`Table Hotspots (${fmtShownOf(stats.tables.length, stats.tableCount)})`} action={<ToggleAll open={all} total={stats.tables.length} onToggle={() => setAll(!all)} />}>
      <Table columns={TABLE_COLUMNS} rows={rows} rowKey={(t) => t.table} selectedKey={stats.filter.table || null} onRowClick={pick} empty={<Empty>No table names found in the queries.</Empty>} />
      <p className="wl-db-note">Rows returned come from the driver. Index use and rows scanned need query plans, which WizeLens does not run.</p>
    </Panel>
  );
}
