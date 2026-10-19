import type { ComponentType, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { fmtMetric, type InfraService } from "@wizeworks/lens-core";
import { fmtAgo } from "../../format";
import { DotText } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { type ChartSeries, TimeChart } from "../../ui/TimeChart";
import { serviceHref } from "./links";

export const DASH = "–";
export const fmtShare = (v: number | null | undefined) => fmtMetric(v, "1");
export const fmtBytes = (v: number | null | undefined) => fmtMetric(v, "By");
export const fmtRate = (v: number | null | undefined) => fmtMetric(v, "By/s");
/** CPU in cores; under one core in millicores, as Kubernetes writes it. */
export function fmtCores(v: number | null | undefined): string {
  if (v === null || v === undefined) return DASH;
  if (v < 0.995) return `${Math.round(v * 1000)} millicores`;
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(2)} cores`;
}

/** "used of total" with the share, for memory and disks. */
export function fmtUsed(used: number | null, total: number | null): string {
  if (used === null) return DASH;
  return total ? `${fmtBytes(used)} of ${fmtBytes(total)}` : fmtBytes(used);
}

/** A share as a small bar and a number; red past 90%, orange past 75%. */
export function UsageBar({ share }: { share: number | null }) {
  if (share === null) return <span className="wl-muted">{DASH}</span>;
  const tone = share >= 0.9 ? "wl-bad" : share >= 0.75 ? "wl-warn" : "";
  return (
    <span className={`wl-usage ${tone}`} title={fmtShare(share)}>
      <span className="wl-usage-track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }} />
      </span>
      <span className="wl-usage-num">{fmtShare(share)}</span>
    </span>
  );
}

/** A number card with a note under it, in the same grid as the service page's cards. */
export function InfraCard({ icon: Icon, label, value, note, danger = false }: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; label: string; value: string; note?: ReactNode; danger?: boolean }) {
  return (
    <section className="wl-panel wl-stat">
      <Icon className={`wl-stat-icon${danger ? " wl-danger" : ""}`} aria-hidden={true} />
      <div className="wl-stat-label">{label}</div>
      <div />
      <div className="wl-stat-value">{value}</div>
      <div className="wl-stat-foot">
        <div className="wl-delta">
          <span>{note}</span>
        </div>
      </div>
    </section>
  );
}

/** The header panel of a host, node, or pod: back link, name, and facts. */
export function InfraHead({ back, backLabel, icon: Icon, title, status, facts }: { back: string; backLabel: string; icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>; title: string; status?: ReactNode; facts: [string, ReactNode][] }) {
  return (
    <section className="wl-panel wl-svc-head">
      <a className="wl-back" href={back}>
        <ArrowLeft size={14} aria-hidden="true" /> {backLabel}
      </a>
      <h1 className="wl-svc-title">
        <Icon size={22} aria-hidden={true} />
        <span className="wl-svc-name">{title}</span>
        {status && <span className="wl-svc-status">{status}</span>}
      </h1>
      <dl className="wl-stats">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One chart panel over the page's buckets. */
export function LinePanel({ title, starts, lines, format }: { title: string; starts: number[]; lines: ChartSeries[]; format: (v: number) => string }) {
  const empty = lines.every((l) => l.values.every((v) => v === null));
  return (
    <Panel title={title}>
      {empty ? <Empty title="No data in this range" /> : <TimeChart starts={starts} lines={lines} height={200} format={format} />}
    </Panel>
  );
}

function serviceColumns(now: number): Column<InfraService>[] {
  return [
    { key: "service", header: "Service", cell: (s) => <a href={serviceHref(s.service)}><strong>{s.service}</strong></a>, sort: (s) => s.service },
    { key: "host", header: "Host or Pod", cell: (s) => s.host || s.pod || DASH, className: "wl-hide-sm" },
    { key: "env", header: "Environment", cell: (s) => s.environment || DASH, className: "wl-hide-sm" },
    { key: "version", header: "Version", cell: (s) => s.version || DASH, className: "wl-hide-sm" },
    { key: "status", header: "Status", cell: (s) => <DotText tone={s.online ? "success" : "neutral"}>{s.online ? "Online" : "Offline"}</DotText>, sort: (s) => (s.online ? 0 : 1) },
    { key: "seen", header: "Last seen", cell: (s) => fmtAgo(s.lastSeenMs, now), sort: (s) => -s.lastSeenMs },
  ];
}

/** Services that run on a host, node, or pod, from the registry. */
export function ServicesPanel({ services, now, empty }: { services: InfraService[]; now: number; empty: string }) {
  return (
    <Panel title="Services" flush>
      <Table columns={serviceColumns(now)} rows={services} rowKey={(s) => `${s.service}|${s.host}|${s.environment}`} defaultSort={{ key: "service", desc: false }} empty={<Empty title="No services">{empty}</Empty>} />
    </Panel>
  );
}

/** What to do when the host does not answer infrastructure pages, or no collector sends yet. */
export function NoInfra({ supported, what }: { supported: boolean; what: string }) {
  return (
    <Panel>
      <Empty title={supported ? `No ${what} metrics yet` : `This dashboard does not keep ${what} metrics`}>
        {supported ? "Run the OpenTelemetry Collector with the WizeLens recipe (deploy/helm/wizelens-collector or deploy/collector/host.yaml) and point it at this hub or the cloud." : "Send host and Kubernetes metrics to a WizeLens hub or the cloud with the OpenTelemetry Collector."}{" "}
        <a href="https://wizelens.com/docs/kubernetes" target="_blank" rel="noreferrer">How to set it up</a>
      </Empty>
    </Panel>
  );
}
