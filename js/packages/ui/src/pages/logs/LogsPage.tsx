import { Bell, FileText, OctagonX, TriangleAlert } from "lucide-react";
import { fmtCount } from "../../format";
import { setQuery } from "../../routes";
import { Pager } from "../../ui/Controls";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { Table } from "../../ui/Table";
import { LOG_COLUMNS, LogFilters, LogVolumePanel } from "./LogParts";
import type { LogsModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { ModelState } from "../../ui/ModelState";
import "../../styles/pages/logs.css";

function LogStatCards({ stats }: { stats: LogsModel }) {
  const { cards, change, sparks, meta } = stats;
  const common = { upIsGood: false, compareLabel: meta.compareLabel };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={FileText} label="Log Lines" value={fmtCount(cards.total)} change={change.total} series={sparks.total} {...common} />
      <StatCard icon={TriangleAlert} label="Warnings" value={fmtCount(cards.warnings)} change={change.warnings} series={sparks.warnings} {...common} />
      <StatCard icon={OctagonX} label="Errors" value={fmtCount(cards.errors)} change={change.errors} series={sparks.errors} danger {...common} />
      <StatCard icon={Bell} label="Critical" value={fmtCount(cards.critical)} change={change.critical} series={sparks.critical} danger {...common} />
    </div>
  );
}

function LogTable({ stats }: { stats: LogsModel }) {
  const { rows, page, pageSize, matching } = stats;
  return (
    <Panel title={`Log Lines (${fmtCount(matching)})`} flush>
      <Table columns={LOG_COLUMNS} rows={rows} rowKey={(r) => r.key} empty={<Empty title="No matching log lines">Try a lower level, another service, or a wider time range.</Empty>} />
      {matching > 0 && (
        <Pager page={page} pageSize={pageSize} total={matching} noun="lines" onPage={(p) => setQuery({ page: p })} onPageSize={(s) => setQuery({ size: s, page: null })} />
      )}
    </Panel>
  );
}

export function LogsPage() {
  const { model: stats, loading, error } = usePageModel("logs");
  return (
    <div className="wl-logs-page">
      <PageHeader title="Logs" subtitle="Every log line written while handling requests, across your services." />
      <ModelState model={stats} loading={loading} error={error} what="log lines" />
      {stats && (
        <>
          <LogStatCards stats={stats} />
          <LogVolumePanel stats={stats} />
          <LogFilters stats={stats} />
          <LogTable stats={stats} />
        </>
      )}
    </div>
  );
}
