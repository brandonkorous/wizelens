import type { ReactNode } from "react";
import { Bell, Boxes, Bug, Users } from "lucide-react";
import { countBy, type ErrorPageModel, percentChange, type RequestItem } from "@wizeworks/lens-core";
import { usePageModel } from "../../data/models";
import { compareSeriesLabel, fmtCount, fmtDateTime, fmtMs, fmtTime } from "../../format";
import { hrefTo, navigate, traceHref } from "../../routes";
import { shortAgent } from "../../ui/agent";
import { Badge, DotText, toneOfStatus } from "../../ui/Badges";
import { BarList } from "../../ui/BarList";
import { DetailHead } from "../../ui/DetailHead";
import { ModelState } from "../../ui/ModelState";
import { Empty, Panel, ViewAll } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { type Column, Table } from "../../ui/Table";
import { TimeChart } from "../../ui/TimeChart";
import { serviceHref } from "../services/serviceParts";
import { StackTrace } from "./ErrorDetailTabs";
import "../../styles/pages/errors.css";

const OCCURRENCE_COLUMNS: Column<RequestItem>[] = [
  { key: "time", header: "Time", className: "wl-nowrap", cell: (r) => fmtTime(r.startMs) },
  { key: "path", header: "Request", className: "wl-cell-wide", cell: (r) => <span className="wl-truncate" title={r.path}>{r.method} {r.path}</span> },
  { key: "status", header: "Status", cell: (r) => <DotText tone={toneOfStatus(r.status)}>{r.status ?? "–"}</DotText> },
  { key: "user", header: "User", className: "wl-nowrap", cell: (r) => r.user ?? <span className="wl-muted">–</span> },
  { key: "browser", header: "Browser", className: "wl-nowrap", cell: (r) => (r.userAgent ? shortAgent(r.userAgent) : <span className="wl-muted">–</span>) },
  { key: "duration", header: "Duration", num: true, cell: (r) => fmtMs(r.durationMs) },
];

function Cards({ m }: { m: ErrorPageModel }) {
  const g = m.group!;
  const users = countBy(m.requests, (r) => r.user).length;
  const common = { upIsGood: false, compareLabel: m.meta.compareLabel };
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Bug} label="Occurrences" value={fmtCount(g.count)} change={m.meta.hasPrev ? percentChange(g.count, m.prevCount) : null} series={m.chart.count} danger {...common} />
      <StatCard icon={Bell} label="Critical" value={fmtCount(m.chart.critical.reduce<number>((t, v) => t + (v ?? 0), 0))} change={null} series={m.chart.critical} danger {...common} />
      <StatCard icon={Boxes} label="Endpoints" value={fmtCount(m.endpoints.length)} change={null} {...common} />
      <StatCard icon={Users} label="Users (newest 50)" value={fmtCount(users)} change={null} {...common} />
    </div>
  );
}

function Breakdown({ m }: { m: ErrorPageModel }) {
  const bars = (list: { value: string; count: number }[]) => list.slice(0, 8).map((x) => ({ key: x.value, label: x.value, value: x.count, display: fmtCount(x.count) }));
  const endpoints = m.endpoints.map((e) => ({ key: e.endpoint, label: e.endpoint, value: e.count, display: fmtCount(e.count), onClick: () => navigate(hrefTo("requests", [], { endpoint: e.endpoint, status: "failed" })) }));
  return (
    <div className="wl-grid wl-grid-3">
      <Panel title="Endpoints">{endpoints.length ? <BarList items={endpoints} /> : <Empty>No endpoint recorded.</Empty>}</Panel>
      <Panel title="Users (newest 50)">{m.requests.some((r) => r.user) ? <BarList items={bars(countBy(m.requests, (r) => r.user))} /> : <Empty>No user was signed in, or the app does not send <code>enduser.id</code>.</Empty>}</Panel>
      <Panel title="Browsers (newest 50)">{m.requests.some((r) => r.userAgent) ? <BarList items={bars(countBy(m.requests, (r) => (r.userAgent ? shortAgent(r.userAgent) : null)))} /> : <Empty>No user agent recorded.</Empty>}</Panel>
    </div>
  );
}

function Body({ m }: { m: ErrorPageModel }) {
  const g = m.group!;
  const stats: [string, ReactNode][] = [["Service", <a key="s" href={serviceHref(g.service)}>{g.service}</a>], ["Type", g.type], ["First seen in range", fmtDateTime(g.firstSeenMs)], ["Last seen", fmtDateTime(g.lastSeenMs)]];
  const bars = [
    { label: "Critical", values: m.chart.critical, color: "var(--wl-red)" },
    { label: "Errors", values: m.chart.count.map((v, i) => (v ?? 0) - (m.chart.critical[i] ?? 0)), color: "color-mix(in srgb, var(--wl-red) 35%, transparent)" },
  ];
  return (
    <>
      <DetailHead back={[hrefTo("errors", [], { service: g.service }), "All errors"]} icon={Bug} title={`${g.type}: ${g.message}`} badge={<Badge tone="danger">{g.critical ? "Critical" : "Error"}</Badge>} stats={stats} />
      <Cards m={m} />
      <Panel title="Occurrences Over Time">
        <TimeChart starts={m.starts} stackBars bars={bars} lines={[{ label: compareSeriesLabel(m.meta.compare), values: m.chart.prev, color: "var(--wl-slate)", dashed: true }]} />
      </Panel>
      <Breakdown m={m} />
      <Panel title="Latest Stack Trace">
        <StackTrace event={g.latest} />
      </Panel>
      <Panel title={`Newest Occurrences (${fmtCount(m.requests.length || m.traces.length)})`} flush action={<ViewAll href={traceHref(g.latest.traceId)} label="Open latest trace" />}>
        <Table columns={OCCURRENCE_COLUMNS} rows={m.requests} rowKey={(r) => r.traceId} onRowClick={(r) => navigate(traceHref(r.traceId, "errors"))} empty={<Empty>These occurrences were not requests (for example browser errors). Open the latest trace to see one.</Empty>} />
      </Panel>
    </>
  );
}

/** One error group on its own page: its count over time, where and for whom it happens, its stack, and its newest occurrences. */
export function ErrorGroupPage({ group }: { group: string }) {
  const { model, loading, error } = usePageModel("error", { group });
  return (
    <div className="wl-dpage wl-errors-page">
      <ModelState model={model} loading={loading} error={error} what="this error" />
      {model && (model.group ? <Body m={model} /> : <Panel><Empty title="This error did not happen in this time range">Pick a longer time range at the top, or go back to <a href={hrefTo("errors")}>all errors</a>.</Empty></Panel>)}
    </div>
  );
}
