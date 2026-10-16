import { Bell, FileText, OctagonX, TriangleAlert } from "lucide-react";
import { fmtCount } from "../../format";
import { setQuery } from "../../routes";
import { Pager } from "../../ui/Controls";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { Table } from "../../ui/Table";
import { LOG_COLUMNS, LogFilters, LogVolumePanel } from "./LogParts";
import { type LogStats, useLogStats } from "./useLogStats";
import "../../styles/pages/logs.css";

function LogStatCards({ stats }: { stats: LogStats }) {
  const { cards, change, sparks, w } = stats;
  const common = { upIsGood: false, compareLabel: w.compareLabel };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={FileText} label="Log Lines" value={fmtCount(cards.total)} change={change.total} series={sparks.total} {...common} />
      <StatCard icon={TriangleAlert} label="Warnings" value={fmtCount(cards.warnings)} change={change.warnings} series={sparks.warnings} {...common} />
      <StatCard icon={OctagonX} label="Errors" value={fmtCount(cards.errors)} change={change.errors} series={sparks.errors} danger {...common} />
      <StatCard icon={Bell} label="Critical" value={fmtCount(cards.critical)} change={change.critical} series={sparks.critical} danger {...common} />
    </div>
  );
}

function LogTable({ stats }: { stats: LogStats }) {
  const { rows, filter } = stats;
  const pages = Math.max(1, Math.ceil(rows.length / filter.pageSize));
  const page = Math.min(filter.page, pages);
  const visible = rows.slice((page - 1) * filter.pageSize, page * filter.pageSize);
  return (
    <Panel title={`Log Lines (${fmtCount(rows.length)})`} flush>
      <Table columns={LOG_COLUMNS} rows={visible} rowKey={(r) => r.key} empty={<Empty title="No matching log lines">Try a lower level, another service, or a wider time range.</Empty>} />
      {rows.length > 0 && (
        <Pager page={page} pageSize={filter.pageSize} total={rows.length} noun="lines" onPage={(p) => setQuery({ page: p })} onPageSize={(s) => setQuery({ size: s, page: null })} />
      )}
    </Panel>
  );
}

export function LogsPage() {
  const stats = useLogStats();
  return (
    <div className="wl-logs-page">
      <PageHeader title="Logs" subtitle="Every log line written while handling requests, across your services." />
      <LogStatCards stats={stats} />
      <LogVolumePanel stats={stats} />
      <LogFilters stats={stats} />
      <LogTable stats={stats} />
    </div>
  );
}
