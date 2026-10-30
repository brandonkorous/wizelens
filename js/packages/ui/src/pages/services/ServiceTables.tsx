import { endpointDoc, type EndpointStat, type ServiceEdge, type ServicePageModel, type ServiceRow } from "@wizeworks/lens-core/internal";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { endpointHref, hrefTo, navigate, queryHref } from "../../routes";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { withTags } from "../../ui/TagChips";
import { useGroupTags } from "../../data/tagMatch";
import { serviceHref } from "./serviceParts";

const rateOf = (errors: number, count: number) => (count ? (errors / count) * 100 : 0);

const ENDPOINT_HEADER: Record<ServiceRow["kind"], string> = { api: "Endpoint", web: "Call", worker: "Operation", queue: "Operation", database: "Query", external: "Call" };

function endpointColumns(kind: ServiceRow["kind"]): Column<EndpointStat>[] {
  return [
    { key: "name", header: ENDPOINT_HEADER[kind], className: "wl-svc-ep-name", cell: (e) => <span className="wl-truncate wl-mono" title={e.name}>{e.name}</span> },
    { key: "count", header: "Count", num: true, cell: (e) => fmtCount(e.count), sort: (e) => e.count },
    { key: "errors", header: "Errors", num: true, cell: (e) => <span className={e.errors ? "wl-text-error" : undefined}>{fmtCount(e.errors)}</span>, sort: (e) => e.errors },
    { key: "rate", header: "Error Rate", num: true, cell: (e) => fmtPct(rateOf(e.errors, e.count)) },
    { key: "avg", header: "Avg Latency", num: true, cell: (e) => fmtMs(e.avgMs), sort: (e) => e.avgMs ?? 0 },
  ];
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

/** Every endpoint, query, or call of the service, a page at a time, busiest first. */
export function EndpointsPanel({ m, row }: { m: ServicePageModel; row: ServiceRow }) {
  const more = moreHref(row);
  const title = row.kind === "database" ? "Queries" : row.kind === "api" ? "Endpoints" : "Operations";
  const groupTags = useGroupTags();
  const columns = row.kind === "api" || row.kind === "worker" ? withTags(endpointColumns(row.kind), "name", (e) => groupTags("endpoints", endpointDoc(row.name, e.name))) : endpointColumns(row.kind);
  const action = more && <ViewAll href={more[0]} label={more[1]} />;
  return (
    <Panel title={`${title} (${fmtCount(m.endpointCount)})`} action={action} flush>
      <Table columns={columns} rows={m.endpoints} served={{ info: m.endpointPaging, noun: title.toLowerCase() }} rowKey={(e) => e.name} onRowClick={endpointClick(row)} empty={<Empty>Nothing recorded in this range.</Empty>} />
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
      <Table paging={{ noun: "services", key: side === "from" ? "callers" : "callees" }} columns={EDGE_COLUMNS(side)} rows={edges} rowKey={(e) => `${e.from}→${e.to}`} onRowClick={(e) => navigate(serviceHref(e[side]))} defaultSort={{ key: "calls", desc: true }} empty={<Empty>{empty}</Empty>} />
    </Panel>
  );
}
