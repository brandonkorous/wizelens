import { useMemo } from "react";
import { X } from "lucide-react";
import { bucketStarts, series, type ServiceEdge, type ServiceRow, type TimeWindow, type Trace } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { setQuery } from "../../routes";
import { Empty, KeyValues, Panel } from "../../ui/Panel";
import { TimeChart } from "../../ui/TimeChart";
import { edgesOf, endpointsOf, type EndpointStat, spansOfRow } from "./serviceData";
import { KIND_LABEL, KindName, StatusText } from "./serviceParts";

const BUCKETS = 24;

function EndpointList({ items, kind }: { items: EndpointStat[]; kind: ServiceRow["kind"] }) {
  if (items.length === 0) return <Empty>Nothing recorded in this range.</Empty>;
  return (
    <table className="wl-table wl-svc-endpoints">
      <thead>
        <tr>
          <th>{kind === "database" ? "Query" : kind === "external" ? "Call" : "Endpoint"}</th>
          <th className="wl-num">Count</th>
          <th className="wl-num">Avg</th>
        </tr>
      </thead>
      <tbody>
        {items.map((e) => (
          <tr key={e.name}>
            <td className="wl-mono wl-small wl-wrap">
              {e.name}
              {e.errors > 0 && <span className="wl-text-error"> · {e.errors} failed</span>}
            </td>
            <td className="wl-num">{fmtCount(e.count)}</td>
            <td className="wl-num">{fmtMs(e.avgMs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EdgeList({ title, edges, side }: { title: string; edges: ServiceEdge[]; side: "from" | "to" }) {
  if (edges.length === 0) return null;
  return (
    <>
      <div className="wl-section-title">{title}</div>
      <ul className="wl-svc-edges">
        {edges.map((e) => (
          <li key={`${e.from}→${e.to}`}>
            <button type="button" className="wl-link-btn" onClick={() => setQuery({ service: e[side] })}>
              {e[side]}
            </button>
            <span className="wl-muted">
              {fmtCount(e.calls)} calls · {fmtMs(e.avgMs)}
              {e.errors ? ` · ${e.errors} failed` : ""}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export interface ServiceDetailProps {
  row: ServiceRow;
  traces: readonly Trace[];
  window: TimeWindow;
  edges: ServiceEdge[];
}

/** One service: numbers, traffic over time, busiest endpoints, and who it talks to. */
export function ServiceDetail({ row, traces, window, edges }: ServiceDetailProps) {
  const spans = useMemo(() => spansOfRow(traces, row), [traces, row]);
  const items = useMemo(() => endpointsOf(spans, row), [spans, row]);
  const counts = series(spans, (s) => s.startMs, window, BUCKETS);
  const { incoming, outgoing } = edgesOf(edges, row.name);
  const title = (
    <div className="wl-side-head">
      <h2><KindName row={row} /></h2>
      <button type="button" className="wl-icon-btn" onClick={() => setQuery({ service: null })} aria-label="Close details"><X size={18} /></button>
    </div>
  );
  return (
    <Panel title={title} className="wl-svc-detail">
      <KeyValues rows={[["Kind", KIND_LABEL[row.kind]], ["Status", <StatusText status={row.status} />], ["Requests", fmtCount(row.requests)], ["Errors", `${fmtCount(row.errors)} (${fmtPct(row.errorRate)})`], ["Avg latency", fmtMs(row.avgMs)], ["p95 latency", fmtMs(row.p95Ms)], ...(row.detail ? [["Detail", row.detail] as [string, string]] : [])]} />
      <div className="wl-section-title">Traffic</div>
      <TimeChart starts={bucketStarts(window, BUCKETS)} bars={[{ label: "Requests", values: counts, color: "var(--wl-blue)" }]} height={140} />
      <div className="wl-section-title">{row.kind === "database" ? "Busiest queries" : "Busiest endpoints"}</div>
      <EndpointList items={items} kind={row.kind} />
      <EdgeList title="Called by" edges={incoming} side="from" />
      <EdgeList title="Calls" edges={outgoing} side="to" />
    </Panel>
  );
}
