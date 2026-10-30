import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Anomaly, Problem, ProblemsModel } from "@wizeworks/lens-core/internal";
import { fmtCount, fmtDateTime } from "../../format";
import { hrefTo } from "../../routes";
import { Dot } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { TimeChart } from "../../ui/TimeChart";
import { CauseLine, fmtMetric, metricLabel, perShown, whenText } from "./problemParts";

function BackLink() {
  return (
    <a className="wl-back" href={hrefTo("problems")}>
      <ArrowLeft size={14} aria-hidden="true" /> All problems
    </a>
  );
}

function ProblemHeader({ p, now }: { p: Problem; now: number }) {
  const stats: [string, string][] = [
    ["Started", fmtDateTime(p.startMs)],
    [p.ongoing ? "Status" : "Ended", p.ongoing ? "Ongoing" : fmtDateTime(p.endMs)],
    ["Services", fmtCount(p.services.length)],
    ["Anomalies", fmtCount(p.anomalyCount)],
  ];
  return (
    <section className="wl-panel wl-pb-head">
      <BackLink />
      <h1 className="wl-pb-head-title">
        <Dot tone={p.ongoing ? "danger" : "neutral"} />
        <span>{p.title}</span>
      </h1>
      <p className="wl-pb-when">{whenText(p, now)}</p>
      <dl className="wl-stats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function CausesPanel({ p }: { p: Problem }) {
  return (
    <Panel title="Suspected Cause">
      {p.cause ? <CauseLine cause={p.cause} /> : <Empty title="No cause stands out">No new release, new error group, slower query, or service further down the calls started with it.</Empty>}
      {p.causes.length > 1 && (
        <div className="wl-pb-also">
          <h3>Also Seen</h3>
          {p.causes.slice(1).map((c) => (
            <CauseLine key={c.kind} cause={c} />
          ))}
        </div>
      )}
    </Panel>
  );
}

const whereOf = (a: Anomaly) => (a.endpoint ? `${a.name} · ${a.endpoint}` : a.name);

function AnomalyChart({ a, m }: { a: Anomaly; m: ProblemsModel }) {
  const shown = (v: readonly (number | null)[]) => perShown(a.metric, v, m.bucketMs);
  const lines = [
    { label: metricLabel(a.metric), values: shown(a.series.values), color: "var(--wl-red)" },
    { label: "Alerts above", values: shown(a.series.uppers), color: "var(--wl-orange)" },
    { label: "Normal", values: shown(a.series.normals), color: "var(--wl-blue)" },
  ];
  const format = (v: number) => fmtMetric(a.metric, a.metric === "requests" ? v * (m.bucketMs / 60_000) : v, m.bucketMs);
  return (
    <Panel title={`${metricLabel(a.metric)}: ${whereOf(a)}`}>
      <TimeChart starts={m.starts} lines={lines} height={240} format={format} />
    </Panel>
  );
}

function anomalyColumns(m: ProblemsModel): Column<Anomaly>[] {
  const fmt = (a: Anomaly, v: number) => fmtMetric(a.metric, v, m.bucketMs);
  return [
    { key: "where", header: "Service / Endpoint", className: "wl-pb-where", cell: (a) => <a href={hrefTo("services", [a.row])} onClick={(e) => e.stopPropagation()}>{whereOf(a)}</a> },
    { key: "metric", header: "Metric", cell: (a) => metricLabel(a.metric) },
    { key: "peak", header: "Peak", num: true, cell: (a) => fmt(a, a.peak.value), sort: (a) => a.peak.value / Math.max(a.peak.upper, 1e-9) },
    { key: "normal", header: "Normal", num: true, cell: (a) => fmt(a, a.peak.normal) },
    { key: "upper", header: "Alerts Above", num: true, cell: (a) => fmt(a, a.peak.upper) },
    { key: "start", header: "Started", num: true, cell: (a) => fmtDateTime(a.startMs), sort: (a) => a.startMs },
  ];
}

/** One problem: when, the suspected cause, each anomaly against its normal, and the services in it. */
export function ProblemDetail({ p, m }: { p: Problem; m: ProblemsModel }) {
  const [picked, setPicked] = useState(p.anomalies[0]?.id ?? "");
  const chosen = p.anomalies.find((a) => a.id === picked) ?? p.anomalies[0];
  const more = p.anomalyCount - p.anomalies.length;
  return (
    <>
      <ProblemHeader p={p} now={m.meta.window.to} />
      <CausesPanel p={p} />
      {chosen && <AnomalyChart a={chosen} m={m} />}
      <Panel flush title={more > 0 ? `Anomalies (${fmtCount(p.anomalies.length)} of ${fmtCount(p.anomalyCount)})` : `Anomalies (${fmtCount(p.anomalyCount)})`}>
        <Table paging={{ noun: "anomalies", key: "anomalies" }} columns={anomalyColumns(m)} rows={p.anomalies} rowKey={(a) => a.id} onRowClick={(a) => setPicked(a.id)} selectedKey={chosen?.id ?? null} />
      </Panel>
    </>
  );
}

/** A problem link whose problem is not in the selected range. */
export function NoProblem() {
  return (
    <Panel>
      <BackLink />
      <Empty title="This problem is not in the selected time range">Pick a longer time range at the top, or open another problem.</Empty>
    </Panel>
  );
}
