import { ExternalLink, X } from "lucide-react";
import type { EndpointStat, ServiceDetailModel, ServiceEdge, ServiceRow } from "@wizeworks/lens-core";
import { fmtCount, fmtMs, fmtPct } from "../../format";
import { setQuery } from "../../routes";
import { Empty, KeyValues, Panel } from "../../ui/Panel";
import { TimeChart } from "../../ui/TimeChart";
import { KIND_LABEL, KindName, serviceHref, StatusText } from "./serviceParts";

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

/** A quick look at one service: numbers, traffic over time, busiest endpoints, who it talks to, and a link to its full page. */
export function ServiceDetail({ detail }: { detail: ServiceDetailModel }) {
  const { row, endpoints: items, incoming, outgoing } = detail;
  const title = (
    <div className="wl-side-head">
      <h2><KindName row={row} /></h2>
      <button type="button" className="wl-icon-btn" onClick={() => setQuery({ service: null })} aria-label="Close details"><X size={18} /></button>
    </div>
  );
  return (
    <Panel title={title} className="wl-svc-detail">
      <KeyValues rows={[["Kind", KIND_LABEL[row.kind]], ["Status", <StatusText status={row.status} />], ["Requests", fmtCount(row.requests)], ["Errors", `${fmtCount(row.errors)} (${fmtPct(row.errorRate)})`], ["Avg latency", fmtMs(row.avgMs)], ["p95 latency", fmtMs(row.p95Ms)], ...(row.detail ? [["Detail", row.detail] as [string, string]] : [])]} />
      <a className="wl-btn wl-btn-primary-outline wl-svc-full" href={serviceHref(row.key)}>
        <ExternalLink aria-hidden="true" /> View full service
      </a>
      <div className="wl-section-title">Traffic</div>
      <TimeChart starts={detail.starts} bars={[{ label: "Requests", values: detail.traffic, color: "var(--wl-blue)" }]} height={140} />
      <div className="wl-section-title">{row.kind === "database" ? "Busiest queries" : "Busiest endpoints"}</div>
      <EndpointList items={items} kind={row.kind} />
      <EdgeList title="Called by" edges={incoming} side="from" />
      <EdgeList title="Calls" edges={outgoing} side="to" />
    </Panel>
  );
}
