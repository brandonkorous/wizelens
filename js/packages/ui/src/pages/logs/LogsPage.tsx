import { useState } from "react";
import { Bell, FileText, OctagonX, TriangleAlert } from "lucide-react";
import { fmtCount } from "../../format";
import { hrefTo, useRoute } from "../../routes";
import { Pager } from "../../ui/Controls";
import { urlPaging } from "../../ui/paging";
import { LiveToggle } from "../../ui/LiveToggle";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { Table } from "../../ui/Table";
import { withTags } from "../../ui/TagChips";
import { logRow, useRowTags } from "../../data/tagMatch";
import { LOG_COLUMNS, LogDetail, LogFilters, LogVolumePanel } from "./LogParts";
import type { LogsModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { ModelState } from "../../ui/ModelState";
import { LogMetricsPanel } from "./LogMetrics";
import { LogPatternsPanel } from "./LogPatterns";
import "../../styles/pages/logs.css";
import { ExportButton } from "../../ui/ExportButton";

function LogStatCards({ stats }: { stats: LogsModel }) {
  const { cards, change, sparks, meta } = stats;
  const common = { upIsGood: false, compareLabel: meta.compareLabel };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={FileText} label="Log Lines" value={fmtCount(cards.total)} change={change.total} series={sparks.total} {...common} />
      <StatCard icon={TriangleAlert} label="Warning Lines" href={hrefTo("logs", [], { level: "warn", exact: "1" })} value={fmtCount(cards.warnings)} change={change.warnings} series={sparks.warnings} {...common} />
      <StatCard icon={OctagonX} label="Error Lines" href={hrefTo("logs", [], { level: "error" })} value={fmtCount(cards.errors)} change={change.errors} series={sparks.errors} danger {...common} />
      <StatCard icon={Bell} label="Critical Lines" href={hrefTo("logs", [], { level: "critical" })} value={fmtCount(cards.critical)} change={change.critical} series={sparks.critical} danger {...common} />
    </div>
  );
}

const TRACE_ID = /^[0-9a-f]{32}$/i;

/** Why no line matched: a trace id that wrote none says so and links the trace. */
function NoLines({ q }: { q: string }) {
  if (!TRACE_ID.test(q)) return <Empty title="No matching log lines">Try a lower level, another service, or a wider time range.</Empty>;
  return (
    <Empty title="No log lines in this trace">
      The request wrote no log lines at these levels. <a href={hrefTo("traces", [q.toLowerCase()])}>Open the trace</a>
    </Empty>
  );
}

function LogTable({ stats }: { stats: LogsModel }) {
  const { rows, page, pageSize, matching } = stats;
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen(open === key ? null : key);
  const tagsOf = useRowTags("logs", rows, logRow);
  const q = useRoute().query.get("q")?.trim() ?? "";
  return (
    <Panel title={`Log Lines (${fmtCount(matching)})`} flush action={<ExportButton page="logs" disabled={matching === 0} />}>
      <Table columns={withTags(LOG_COLUMNS, "message", tagsOf)} rows={rows} rowKey={(r) => r.key} selectedKey={open} onRowClick={(r) => toggle(r.key)} detail={(r) => <LogDetail row={r} />} empty={<NoLines q={q} />} />
      <Pager page={page} pageSize={pageSize} total={matching} noun="lines" {...urlPaging()} />
    </Panel>
  );
}

export function LogsPage() {
  const [paused, setPaused] = useState(false);
  const { model: stats, loading, error } = usePageModel("logs", undefined, paused);
  return (
    <div className="wl-logs-page">
      <PageHeader title="Logs" subtitle="Every log line across your services: in requests, and outside them (startup, jobs, timers).">
        <LiveToggle paused={paused} onChange={setPaused} />
      </PageHeader>
      <ModelState model={stats} loading={loading} error={error} what="log lines" />
      {stats && (
        <>
          <LogStatCards stats={stats} />
          <LogFilters stats={stats} />
          <LogMetricsPanel />
          <LogTable stats={stats} />
          <LogVolumePanel stats={stats} />
          <LogPatternsPanel />
        </>
      )}
    </div>
  );
}
