import { Clock, Gauge, Timer, TriangleAlert, UserRound } from "lucide-react";
import type { RequestItem, UserModel } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { fmtCount, fmtMs, fmtPct, fmtTime } from "../../format";
import { errorHref, hrefTo, navigate, traceHref } from "../../routes";
import { DotText, toneOfStatus } from "../../ui/Badges";
import { DetailHead } from "../../ui/DetailHead";
import { ModelState } from "../../ui/ModelState";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { type Column, Table } from "../../ui/Table";
import { TimeChart } from "../../ui/TimeChart";

const REQUEST_COLUMNS: Column<RequestItem>[] = [
  { key: "time", header: "Time", className: "wl-nowrap", cell: (r) => fmtTime(r.startMs) },
  { key: "path", header: "Request", className: "wl-cell-wide", cell: (r) => <span className="wl-truncate" title={r.path}>{r.method} {r.path}</span> },
  { key: "status", header: "Status", cell: (r) => <DotText tone={toneOfStatus(r.status)}>{r.status ?? "–"}</DotText> },
  { key: "duration", header: "Duration", num: true, cell: (r) => fmtMs(r.durationMs) },
];

function Cards({ m }: { m: UserModel }) {
  const t = m.totals!;
  const common = { change: null, upIsGood: false, compareLabel: m.meta.compareLabel, note: "In this range" };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Gauge} label="Requests" value={fmtCount(t.requests)} series={m.chart.requests} {...common} upIsGood />
      <StatCard icon={TriangleAlert} label="Error Rate" value={t.errorRate === null ? "–" : fmtPct(t.errorRate)} series={m.chart.errors} danger {...common} />
      <StatCard icon={Clock} label="Average" value={fmtMs(t.avgMs)} series={m.chart.avgMs} {...common} />
      <StatCard icon={Timer} label="p95" value={fmtMs(t.p95Ms)} {...common} />
    </div>
  );
}

function Body({ m }: { m: UserModel }) {
  const links = { user: m.user };
  const stats: [string, string][] = [["Requests", fmtCount(m.totals!.requests)], ["Failed", fmtCount(m.totals!.errors)], ["Error groups", fmtCount(m.errors.length)]];
  const actions = (
    <span className="wl-row-actions">
      <ViewAll href={hrefTo("requests", [], links)} label="Requests" />
      <ViewAll href={hrefTo("errors", [], { ...links, status: "all" })} label="Errors" />
      <ViewAll href={hrefTo("logs", [], links)} label="Logs" />
    </span>
  );
  return (
    <>
      <DetailHead back={["#/users", "All users"]} icon={UserRound} title={m.user} mono actions={actions} stats={stats} />
      <Cards m={m} />
      <Panel title="Requests Over Time">
        <TimeChart starts={m.starts} lines={[{ label: "Requests", values: m.chart.requests, color: "var(--wl-blue)" }]} bars={[{ label: "Failed", values: m.chart.errors, color: "var(--wl-red)" }]} separateBarScale height={200} />
      </Panel>
      <div className="wl-grid wl-grid-2-even">
        <Panel title="Errors They Hit" flush>
          <Table columns={[{ key: "e", header: "Error", className: "wl-cell-wide", cell: (e) => <span className="wl-truncate">{e.group.type}: {e.group.message}</span> }, { key: "n", header: "Times", num: true, cell: (e) => fmtCount(e.count) }]} rows={m.errors} rowKey={(e) => e.group.key} onRowClick={(e) => navigate(errorHref(e.group.key))} empty={<Empty>No errors in this range.</Empty>} />
        </Panel>
        <Panel title="Slowest Requests" flush>
          <Table columns={REQUEST_COLUMNS} rows={m.slowest} rowKey={(r) => r.traceId} onRowClick={(r) => navigate(traceHref(r.traceId))} empty={<Empty>No requests.</Empty>} />
        </Panel>
      </div>
      <Panel title="Newest Requests" flush>
        <Table columns={REQUEST_COLUMNS} rows={m.recent} rowKey={(r) => r.traceId} onRowClick={(r) => navigate(hrefTo("requests", [], { trace: r.traceId }))} empty={<Empty>No requests.</Empty>} />
      </Panel>
    </>
  );
}

/** One signed-in user: their requests over time, the errors they hit, their slowest and newest requests. */
export function UserPage({ user }: { user: string }) {
  const { model, loading, error } = usePageModel("user", { user });
  return (
    <div className="wl-dpage">
      <ModelState model={model} loading={loading} error={error} what="this user" />
      {model && (model.totals ? <Body m={model} /> : <Panel><Empty title="This user did nothing in this time range">Pick a longer time range at the top, or go back to <a href="#/users">all users</a>.</Empty></Panel>)}
    </div>
  );
}
