import type { ComponentType } from "react";
import { Box, Cog, Database, Globe, Inbox, Monitor } from "lucide-react";
import { isLocalAddress, type ServiceKind, type ServiceRow, type ServiceStatus, serviceDoc } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { decodeParam, hrefTo, setQuery } from "../../routes";
import { DotText, type Tone } from "../../ui/Badges";
import { Empty } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { withTags } from "../../ui/TagChips";
import { useGroupTags } from "../../data/tagMatch";

export const KIND_ICON: Record<ServiceKind, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = { api: Box, web: Monitor, worker: Cog, queue: Inbox, database: Database, external: Globe };
export const KIND_LABEL: Record<ServiceKind, string> = { api: "API service", web: "Web app", worker: "Message worker", queue: "Queue", database: "Database", external: "Outside service" };

const STATUS: Record<ServiceStatus, [Tone, string]> = {
  healthy: ["success", "Healthy"],
  degraded: ["warning", "Degraded"],
  unhealthy: ["danger", "Unhealthy"],
  idle: ["neutral", "Idle"],
};

export const statusTone = (s: ServiceStatus): Tone => STATUS[s][0];

/** Link to the full page of a service, by its row key or its name. */
export const serviceHref = (keyOrName: string): string => hrefTo("services", [encodeURIComponent(keyOrName)]);

/** The service id from the path; a broken escape is kept as typed. */
export const serviceIdOf = decodeParam;

export function StatusText({ status }: { status: ServiceStatus }) {
  const [tone, label] = STATUS[status];
  return (
    <DotText tone={tone} colorText={tone !== "neutral"}>
      {label}
    </DotText>
  );
}

export function KindName({ row }: { row: ServiceRow }) {
  const Icon = KIND_ICON[row.kind];
  return (
    <span className="wl-cell-icon" title={KIND_LABEL[row.kind]}>
      <Icon size={18} aria-hidden={true} />
      {row.kind === "external" && isLocalAddress(row.detail) ? (
        <span className="wl-who">{row.name}<small>Local address: no service you trace answered these calls</small></span>
      ) : row.name}
    </span>
  );
}

// On a phone the numbers go on one line under the name, so the table needs no sideways swipe.
const phoneLine = (r: ServiceRow) => `${fmtCount(r.requests)} ${r.kind === "database" ? "queries" : "requests"} · ${fmtPct(r.errorRate)} errors · avg ${fmtMs(r.avgMs)}`;

const COLUMNS: Column<ServiceRow>[] = [
  { key: "name", header: "Service", cell: (r) => <span className="wl-who"><KindName row={r} /><small className="wl-phone-line">{phoneLine(r)}</small></span>, sort: (r) => r.name },
  { key: "status", header: "Status", cell: (r) => <StatusText status={r.status} />, sort: (r) => r.errorRate },
  { key: "requests", header: "Requests", num: true, hideSm: true, cell: (r) => fmtCount(r.requests), sort: (r) => r.requests },
  { key: "errors", header: "Errors", num: true, hideSm: true, cell: (r) => fmtCount(r.errors), sort: (r) => r.errors },
  { key: "rate", header: "Error rate", num: true, hideSm: true, cell: (r) => fmtPct(r.errorRate), sort: (r) => r.errorRate },
  { key: "avg", header: "Avg latency", num: true, hideSm: true, cell: (r) => fmtMs(r.avgMs), sort: (r) => r.avgMs ?? 0 },
  { key: "p95", header: "p95", num: true, hideSm: true, cell: (r) => fmtMs(r.p95Ms), sort: (r) => r.p95Ms ?? 0 },
];

/** Every service, database, and outside host. A click opens its details. */
export function ServiceTable({ rows, selectedKey }: { rows: ServiceRow[]; selectedKey: string | null }) {
  const groupTags = useGroupTags();
  return (
    <Table
      paging={{ noun: "services", key: "services" }}
      columns={withTags(COLUMNS, "name", (r) => groupTags("services", serviceDoc(r.name)))}
      rows={rows}
      rowKey={(r) => r.key}
      selectedKey={selectedKey}
      onRowClick={(r) => setQuery({ service: r.key === selectedKey ? null : r.key })}
      empty={<Empty title="No services yet">Services show up here when they handle a request in this time range.</Empty>}
    />
  );
}
