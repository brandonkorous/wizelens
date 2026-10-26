import { ArrowDown, ArrowUp, Box, Monitor } from "lucide-react";
import { type ErrorGroup, errorGroupDoc, type ErrorsModel, type IssueInfo, isErrorFiltered, isWebAppName, percentChange, type ServiceErrorRow } from "@wizeworks/lens-core";
import { fmtCount, fmtPct, fmtTime } from "../../format";
import { setQuery } from "../../routes";
import { DotText } from "../../ui/Badges";
import { Pager } from "../../ui/Controls";
import { urlPaging } from "../../ui/paging";
import { Empty, Panel } from "../../ui/Panel";
import { Sparkline } from "../../ui/Sparkline";
import { useIssueBulk } from "../../ui/IssueBulk";
import { IssueBadge } from "../../ui/IssueControls";
import { useSetService } from "../../ui/ServiceSelect";
import { type Column, Table } from "../../ui/Table";
import { ExportButton } from "../../ui/ExportButton";
import { withTags } from "../../ui/TagChips";
import { useGroupTags } from "../../data/tagMatch";

const pathOf = (endpoint: string) => endpoint.replace(/^[A-Z]+ /, "");

const groupColumns = (issues: Record<string, IssueInfo>): Column<ErrorGroup>[] => [
  { key: "time", header: "Time", className: "wl-nowrap", sort: (g) => g.lastSeenMs, cell: (g) => fmtTime(g.lastSeenMs) },
  {
    key: "status",
    header: "Status",
    cell: (g) => (
      <span className="wl-err-status">
        <DotText tone="danger" colorText>{g.critical ? "Critical" : "Error"}</DotText>
        <IssueBadge info={issues[g.key]} />
      </span>
    ),
  },
  { key: "error", header: "Error", className: "wl-err-text", cell: (g) => <span className="wl-truncate" title={`${g.type}: ${g.message}`}>{g.type}: {g.message}</span> },
  { key: "endpoint", header: "Endpoint", className: "wl-err-endpoint", cell: (g) => <span className="wl-truncate" title={g.endpoint}>{pathOf(g.endpoint)}</span> },
  { key: "service", header: "Service", className: "wl-nowrap", cell: (g) => g.service },
  { key: "count", header: "Count", num: true, sort: (g) => g.count, cell: (g) => fmtCount(g.count) },
];

/** One page of the exception groups that match the filter. A row shows its details. */
export function RecentExceptionsPanel({ stats, selected }: { stats: ErrorsModel; selected: string | null }) {
  const filtered = isErrorFiltered(stats.filter);
  const title = stats.filter.sort === "count" ? "Most Frequent Exceptions" : "Recent Exceptions";
  const groupTags = useGroupTags();
  const bulk = useIssueBulk("error", stats.groups.map((g) => g.key));
  return (
    <Panel title={`${title} (${fmtCount(stats.groupCount)})`} flush className="wl-err-list" action={<ExportButton page="errors" disabled={stats.groupCount === 0} />}>
      {bulk.bar}
      <Table
        select={bulk.select}
        columns={withTags(groupColumns(stats.issues), "error", (g) => groupTags("errors", errorGroupDoc(g)))}
        rows={stats.groups}
        rowKey={(g) => g.key}
        selectedKey={selected}
        onRowClick={(g) => setQuery({ group: g.key })}
        empty={<Empty title={filtered ? "No matching exceptions" : "No exceptions"}>{filtered ? "Try another filter or a wider time range." : "Nothing failed in this time range."}</Empty>}
      />
      <Pager page={stats.page} pageSize={stats.size} total={stats.groupCount} noun="groups" {...urlPaging()} />
    </Panel>
  );
}

function Change({ now, before }: { now: number; before: number }) {
  const pct = percentChange(now, before);
  if (pct === null) return <span className="wl-muted">–</span>;
  const Arrow = pct >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`wl-err-change ${pct > 0 ? "wl-text-error" : "wl-text-ok"}`}>
      <Arrow aria-hidden="true" />
      {fmtPct(Math.abs(pct))}
    </span>
  );
}

function serviceColumns(): Column<ServiceErrorRow>[] {
  return [
    { key: "service", header: "Service", cell: (s) => <span className="wl-cell-icon">{isWebAppName(s.service) ? <Monitor aria-hidden="true" /> : <Box aria-hidden="true" />}{s.service}</span> },
    { key: "exceptions", header: "Exceptions", num: true, sort: (s) => s.exceptions, cell: (s) => fmtCount(s.exceptions) },
    { key: "rate", header: "Error Rate", num: true, sort: (s) => s.errorRate, cell: (s) => (s.requests ? fmtPct(s.errorRate) : "–") },
    { key: "trend", header: "Trend", cell: (s) => <Sparkline values={s.trend} width={110} height={24} color="var(--wl-red)" /> },
    { key: "change", header: "", num: true, cell: (s) => <Change now={s.exceptions} before={s.prevExceptions} /> },
  ];
}

/** Exceptions and error rate per service. A row filters the page by that service. */
export function ErrorsByServicePanel({ stats }: { stats: ErrorsModel }) {
  const pick = useSetService();
  return (
    <Panel title="Errors by Service">
      <Table columns={serviceColumns()} rows={stats.services} rowKey={(s) => s.service} selectedKey={stats.filter.service || null} onRowClick={(s) => pick(s.service === stats.filter.service ? "" : s.service)} empty={<Empty>No services seen yet.</Empty>} />
    </Panel>
  );
}
