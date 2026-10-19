import { useState } from "react";
import type { EndpointStat, ServiceEdge, ServicePageModel, ServiceRow } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { endpointHref, hrefTo, navigate, queryHref } from "../../routes";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { serviceHref } from "./serviceParts";

export const TOP = 10;

const rateOf = (errors: number, count: number) => (count ? (errors / count) * 100 : 0);

const ENDPOINT_HEADER: Record<ServiceRow["kind"], string> = { api: "Endpoint", web: "Call", worker: "Operation", queue: "Operation", database: "Query", external: "Call" };

function endpointColumns(kind: ServiceRow["kind"]): Column<EndpointStat>[] {
  return [
    { key: "name", header: ENDPOINT_HEADER[kind], className: "wl-svc-ep-name", cell: (e) => <span className="wl-truncate wl-mono" title={e.name}>{e.name}</span>, sort: (e) => e.name },
    { key: "count", header: "Count", num: true, cell: (e) => fmtCount(e.count), sort: (e) => e.count },
    { key: "errors", header: "Errors", num: true, cell: (e) => <span className={e.errors ? "wl-text-error" : undefined}>{fmtCount(e.errors)}</span>, sort: (e) => e.errors },
    { key: "rate", header: "Error Rate", num: true, cell: (e) => fmtPct(rateOf(e.errors, e.count)), sort: (e) => rateOf(e.errors, e.count) },
    { key: "avg", header: "Avg Latency", num: true, cell: (e) => fmtMs(e.avgMs), sort: (e) => e.avgMs ?? 0 },
  ];
}

/** "View all 42" or "Show top 10", when there are more rows than the top. */
export function ToggleAll({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
  if (total <= TOP) return null;
  return (
    <button type="button" className="wl-view-all wl-link-btn" onClick={onToggle}>
      {open ? `Show top ${TOP}` : `View all ${fmtCount(total)}`}
    </button>
  );
}

/** Where the full list lives on another page, by kind. */
function moreHref(row: ServiceRow): [string, string] | null {
  if (row.kind === "api" || row.kind === "worker") return [hrefTo("requests", [], { service: row.name }), "View requests"];
  if (row.kind === "database") return [hrefTo("database", [], { database: row.name }), "View queries"];
  return null;
}

/** API endpoints open their page; database queries open theirs. */
function endpointClick(row: ServiceRow): ((e: EndpointStat) => void) | undefined {
  if (row.kind === "api") return (e) => navigate(endpointHref(row.key, e.name));
  if (row.kind === "database") return (e) => navigate(queryHref(e.name));
  return undefined;
}

/** Every endpoint, query, or call of the service, busiest first. */
export function EndpointsPanel({ m, row }: { m: ServicePageModel; row: ServiceRow }) {
  const [all, setAll] = useState(false);
  const rows = all ? m.endpoints : m.endpoints.slice(0, TOP);
  const more = moreHref(row);
  const title = row.kind === "database" ? "Queries" : row.kind === "api" ? "Endpoints" : "Operations";
  const action = (
    <span className="wl-row-actions">
      <ToggleAll open={all} total={m.endpoints.length} onToggle={() => setAll(!all)} />
      {more && <ViewAll href={more[0]} label={more[1]} />}
    </span>
  );
  return (
    <Panel title={`${title} (${fmtCount(m.endpointCount)})`} action={action} flush>
      <Table columns={endpointColumns(row.kind)} rows={rows} rowKey={(e) => e.name} onRowClick={endpointClick(row)} defaultSort={{ key: "count", desc: true }} empty={<Empty>Nothing recorded in this range.</Empty>} />
    </Panel>
  );
}

const EDGE_COLUMNS = (side: "from" | "to"): Column<ServiceEdge>[] => [
  { key: "name", header: "Service", cell: (e) => <a href={serviceHref(e[side])} onClick={(ev) => ev.stopPropagation()}>{e[side]}</a>, sort: (e) => e[side] },
  { key: "calls", header: "Calls", num: true, cell: (e) => fmtCount(e.calls), sort: (e) => e.calls },
  { key: "errors", header: "Errors", num: true, cell: (e) => <span className={e.errors ? "wl-text-error" : undefined}>{fmtCount(e.errors)}</span>, sort: (e) => e.errors },
  { key: "avg", header: "Avg Latency", num: true, cell: (e) => fmtMs(e.avgMs), sort: (e) => e.avgMs ?? 0 },
];

/** Who calls this service ("from"), or what it calls ("to"). A row opens that service. */
export function EdgesPanel({ title, edges, side, empty }: { title: string; edges: ServiceEdge[]; side: "from" | "to"; empty: string }) {
  return (
    <Panel title={title} flush>
      <Table columns={EDGE_COLUMNS(side)} rows={edges} rowKey={(e) => `${e.from}→${e.to}`} onRowClick={(e) => navigate(serviceHref(e[side]))} defaultSort={{ key: "calls", desc: true }} empty={<Empty>{empty}</Empty>} />
    </Panel>
  );
}
