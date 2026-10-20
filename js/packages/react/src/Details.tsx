import { type ReactNode, useMemo } from "react";
import { analyzeTrace, type Finding, type FindingKind, SECURITY_LABELS, type Trace, type TraceView, traceTiming } from "@wizeworks/lens-core";
import { fmtMs, type PageStats, pct, type RecordedRequest, type Recorder, type RequestView } from "@wizeworks/lens-browser";
import { DashLink, dashboardLink, NoServerData, PanelBar, StackBar, statusPill, useTrace } from "./panel-parts.js";
import { Waterfall, waterfallRows } from "./waterfall.js";

const FINDING_LABEL: Record<FindingKind, string> = {
  error: "Error",
  "n+1-db": "N+1 query",
  "n+1-http": "N+1 HTTP",
  "duplicate-query": "Duplicate",
  "slow-query": "Slow query",
  "db-wait": "Database wait",
  ...SECURITY_LABELS,
};

// Rows of the short timeline and insights shown. The dashboard shows them all.
const TIMELINE_ROWS = 6;
const TOP_INSIGHTS = 3;

export interface DetailsProps {
  recorder: Recorder;
  req: RecordedRequest | null;
  view: RequestView;
  page: PageStats;
  onClose: () => void;
}

const grade = (v: number | null, good: number, poor: number) => (v === null ? undefined : v <= good ? "wl-good" : v <= poor ? "wl-fair" : "wl-poor");

function Stat({ label, value, cls, title }: { label: string; value: ReactNode; cls?: string; title?: string }) {
  return (
    <div className="wl-stat" title={title}>
      <dt>{label}</dt>
      <dd className={cls}>{value}</dd>
    </div>
  );
}

function FindingList({ findings }: { findings: Finding[] }) {
  return (
    <div>
      {findings.map((f, i) => (
        <div key={`${f.kind}-${i}`} className={`wl-finding wl-f-${f.severity}`}>
          <span className={`wl-badge wl-b-${f.severity}`}>{FINDING_LABEL[f.kind]}</span>
          <strong>{f.title}</strong>
          <span className="wl-muted">{fmtMs(f.totalMs)}</span>
          <code className="wl-mono">{f.shape}</code>
        </div>
      ))}
    </div>
  );
}

function Legend({ view }: { view: RequestView }) {
  const item = (cls: string, ms: number | null, label: string) => (
    <span>
      <i className={`wl-dot ${cls}`} /> <b>{fmtMs(ms)}</b> {label} {pct(ms, view.totalMs) && `(${pct(ms, view.totalMs)})`}
    </span>
  );
  return (
    <div className="wl-legend">
      {item("wl-c-server", view.serverMs, "Server")}
      {item("wl-c-db", view.dbMs, "Database")}
      {item("wl-c-render", view.renderMs, "Render")}
    </div>
  );
}

function PageVitals({ page }: { page: PageStats }) {
  return (
    <dl className="wl-stats wl-stats-sm">
      <Stat label="Page load" value={fmtMs(page.totalMs)} />
      <Stat label="LCP" value={fmtMs(page.lcpMs)} cls={grade(page.lcpMs, 2500, 4000)} title="Largest Contentful Paint: when the main content shows. Good: 2.5 s or less." />
      <Stat label="INP" value={fmtMs(page.inpMs)} cls={grade(page.inpMs, 200, 500)} title="Interaction to Next Paint: the slowest click or key press. Good: 200 ms or less." />
      <Stat label="CLS" value={page.cls === null ? "—" : page.cls.toFixed(3)} cls={grade(page.cls, 0.1, 0.25)} title="Cumulative Layout Shift: how much the page jumps. Good: 0.1 or less." />
    </dl>
  );
}

function RequestBody({ req, view, trace, link }: { req: RecordedRequest; view: RequestView; trace: Trace | null; link: (v: TraceView) => string }) {
  const findings = useMemo(() => (trace ? analyzeTrace(trace) : []), [trace]);
  const rows = useMemo(() => waterfallRows(req, trace), [req, trace]);
  const service = trace ? traceTiming(trace).service : req.server?.services[0];
  return (
    <>
      <div className="wl-meta">
        {new Date(req.startMs).toLocaleTimeString()} · {fmtMs(view.totalMs)}
        {service ? ` · ${service}` : ""}
      </div>
      <StackBar view={view} large failed={view.health === "critical"} />
      <Legend view={view} />
      <h3>Timeline</h3>
      {req.profiled && !trace ? <NoServerData req={req} /> : <Waterfall rows={rows} origin={req.startMs} limit={TIMELINE_ROWS} />}
      {req.profiled && <DashLink href={link("timeline")}>{rows.length > TIMELINE_ROWS ? `View all ${rows.length} rows` : "View the full timeline"}</DashLink>}
      {findings.length > 0 && (
        <>
          <h3>Insights · {findings.length}</h3>
          <FindingList findings={findings.slice(0, TOP_INSIGHTS)} />
          <DashLink href={link("insights")}>{findings.length > TOP_INSIGHTS ? `View all ${findings.length} insights` : "View insights"}</DashLink>
        </>
      )}
    </>
  );
}

/** A short look at one request. Every "view all" link opens the dashboard in a new tab. */
export function Details({ recorder, req, view, page, onClose }: DetailsProps) {
  const trace = useTrace(recorder, req);
  const pill = statusPill(req, view);
  return (
    <section className="wl-panel wl-details" aria-label="WizeLens request details">
      <PanelBar onClose={onClose}>
        <span className="wl-panel-title" title={req?.url}>
          {req ? `${req.method} ${req.path}` : "Request details"}
        </span>
        {req && <span className={`wl-pill ${pill.cls}`}>{pill.text}</span>}
      </PanelBar>
      <div className="wl-body">
        {req ? <RequestBody req={req} view={view} trace={trace} link={(v) => dashboardLink(recorder, req, v)} /> : <NoServerData req={null} />}
        <h3>This page</h3>
        <PageVitals page={page} />
      </div>
    </section>
  );
}
