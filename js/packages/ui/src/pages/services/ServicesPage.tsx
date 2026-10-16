import { useMemo } from "react";
import { Box, Database, Gauge, TriangleAlert } from "lucide-react";
import { percentChange, percentOf, series, serviceEdges, serviceRows, type ServiceRow, type TimeWindow, type Trace } from "@wizeworks/lens-core";
import { useWindowed } from "../../data/hooks";
import { fmtCount, fmtPct } from "../../format";
import { useRoute } from "../../routes";
import { PageHeader, Panel } from "../../ui/Panel";
import { StatCard } from "../../ui/StatCard";
import { DependencyMap } from "./DependencyMap";
import { findRow } from "./serviceData";
import { ServiceDetail } from "./ServiceDetail";
import { ServiceTable } from "./serviceParts";
import "../../styles/pages/services.css";

const BUCKETS = 24;

interface Summary {
  apis: number;
  databases: number;
  served: number;
  errorRate: number | null;
}

function summarize(rows: ServiceRow[]): Summary {
  const apis = rows.filter((r) => r.kind === "api");
  const served = apis.reduce((t, r) => t + r.requests, 0);
  const errors = apis.reduce((t, r) => t + r.errors, 0);
  return { apis: apis.length, databases: rows.filter((r) => r.kind === "database").length, served, errorRate: served ? percentOf(errors, served) : null };
}

function serverSeries(traces: readonly Trace[], window: TimeWindow) {
  const servers = traces.flatMap((t) => t.spans.filter((s) => s.category === "http.server"));
  const failed = servers.filter((s) => s.status === "error" || Number(s.attributes["http.response.status_code"] ?? 0) >= 500);
  return { served: series(servers, (s) => s.startMs, window, BUCKETS), failed: series(failed, (s) => s.startMs, window, BUCKETS) };
}

function Cards({ cur, prev, traces, window, compareLabel, hasPrev }: { cur: Summary; prev: Summary; traces: readonly Trace[]; window: TimeWindow; compareLabel: string; hasPrev: boolean }) {
  const s = useMemo(() => serverSeries(traces, window), [traces, window]);
  const change = (a: number | null, b: number | null) => (hasPrev ? percentChange(a, b) : null);
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={Box} label="Services" value={fmtCount(cur.apis)} change={change(cur.apis, prev.apis)} upIsGood compareLabel={compareLabel} />
      <StatCard icon={Database} label="Databases" value={fmtCount(cur.databases)} change={change(cur.databases, prev.databases)} upIsGood compareLabel={compareLabel} />
      <StatCard icon={Gauge} label="Requests Served" value={fmtCount(cur.served)} change={change(cur.served, prev.served)} upIsGood compareLabel={compareLabel} series={s.served} />
      <StatCard icon={TriangleAlert} label="Error Rate" value={fmtPct(cur.errorRate)} change={change(cur.errorRate, prev.errorRate)} upIsGood={false} compareLabel={compareLabel} series={s.failed} danger />
    </div>
  );
}

export function ServicesPage() {
  const win = useWindowed();
  const route = useRoute();
  const rows = useMemo(() => serviceRows(win.traces), [win.traces]);
  const prevRows = useMemo(() => serviceRows(win.prevTraces), [win.prevTraces]);
  const edges = useMemo(() => serviceEdges(win.traces), [win.traces]);
  const selected = findRow(rows, route.query.get("service"));
  return (
    <>
      <PageHeader title="Services" subtitle="Every service and database in your stack, how healthy it is, and what it talks to." />
      <Cards cur={summarize(rows)} prev={summarize(prevRows)} traces={win.traces} window={win.window} compareLabel={win.compareLabel} hasPrev={win.prevTraces.length > 0} />
      <div className={`wl-grid${selected ? " wl-grid-side" : ""}`}>
        <Panel title={`Services (${rows.length})`} flush>
          <ServiceTable rows={rows} selectedKey={selected?.key ?? null} />
        </Panel>
        {selected && <ServiceDetail row={selected} traces={win.traces} window={win.window} edges={edges} />}
      </div>
      <Panel title="Dependencies">
        <DependencyMap rows={rows} edges={edges} selectedKey={selected?.key ?? null} />
      </Panel>
    </>
  );
}

