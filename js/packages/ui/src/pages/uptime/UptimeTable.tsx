import type { ReactNode } from "react";
import { tlsDaysLeft, TLS_WARN_DAYS, type UptimeCheckView, type UptimeModel } from "@wizeworks/lens-core";
import { fmtAgo, fmtMs } from "../../format";
import { hrefTo } from "../../routes";
import { Badge, DotText, type Tone } from "../../ui/Badges";
import { Sparkline } from "../../ui/Sparkline";
import { type Column, Table, type TableSelect } from "../../ui/Table";
import { fmtUptime, statsOf, stateOf } from "./uptimeParts";
import { projectColumn } from "../../ui/ProjectColumn";

/** Days left on the certificate: a warning under 14 days, red once it has ended. */
export function CertBadge({ c, nowMs }: { c: UptimeCheckView; nowMs: number }) {
  const days = tlsDaysLeft(c.tlsExpiresMs, nowMs);
  if (days === null) return <span className="wl-muted">{c.url.startsWith("https:") ? "–" : "No TLS"}</span>;
  const tone: Tone = days < 0 ? "danger" : days < TLS_WARN_DAYS ? "warning" : "neutral";
  return <Badge tone={tone}>{days < 0 ? "Expired" : `${days} days`}</Badge>;
}

export function StateText({ c }: { c: UptimeCheckView }) {
  const s = stateOf(c);
  return <DotText tone={s.tone} colorText={s.tone === "danger"}>{s.label}</DotText>;
}

interface TableProps {
  checks: readonly UptimeCheckView[];
  model: UptimeModel | null;
  nowMs: number;
  canWrite: boolean;
  onRun: (c: UptimeCheckView) => void;
  onEdit: (c: UptimeCheckView) => void;
  onDelete: (c: UptimeCheckView) => void;
  empty: ReactNode;
  select?: TableSelect;
}

function actionColumn(p: TableProps): Column<UptimeCheckView>[] {
  if (!p.canWrite) return [];
  const cell = (c: UptimeCheckView) => (
    <span className="wl-row-actions">
      <button type="button" className="wl-link-btn" onClick={() => p.onRun(c)}>Run now</button>
      <button type="button" className="wl-link-btn" onClick={() => p.onEdit(c)}>Edit</button>
      <button type="button" className="wl-link-btn wl-text-error" onClick={() => p.onDelete(c)}>Delete</button>
    </span>
  );
  return [{ key: "actions", header: "", cell }];
}

function columns(p: TableProps): Column<UptimeCheckView>[] {
  const pct = (w: "24h" | "7d" | "30d") => ({ key: w, header: w, num: true, sort: (c: UptimeCheckView) => c.uptime[w] ?? -1, cell: (c: UptimeCheckView) => fmtUptime(c.uptime[w]) });
  return [
    { key: "state", header: "Status", sort: (c) => stateOf(c).rank, cell: (c) => <StateText c={c} /> },
    ...projectColumn<UptimeCheckView>(),
    { key: "name", header: "Check", sort: (c) => c.name.toLowerCase(), className: "wl-uptime-name", cell: (c) => <a href={hrefTo("uptime", [c.id])}><strong>{c.name}</strong><span className="wl-muted wl-small">{c.method} {c.url}</span></a> },
    pct("24h"),
    pct("7d"),
    pct("30d"),
    { key: "avg", header: "Response", num: true, sort: (c) => c.lastDurationMs ?? -1, cell: (c) => <ResponseCell c={c} model={p.model} /> },
    { key: "last", header: "Last Check", className: "wl-nowrap", sort: (c) => c.lastRunMs ?? 0, cell: (c) => (c.lastRunMs ? fmtAgo(c.lastRunMs, p.nowMs) : "Not yet") },
    { key: "tls", header: "Certificate", sort: (c) => c.tlsExpiresMs ?? Infinity, cell: (c) => <CertBadge c={c} nowMs={p.nowMs} /> },
    ...actionColumn(p),
  ];
}

/** The newest response time, with the range's averages as a sparkline. */
function ResponseCell({ c, model }: { c: UptimeCheckView; model: UptimeModel | null }) {
  const s = statsOf(model, c.id);
  return (
    <span className="wl-uptime-response">
      {s && <Sparkline values={s.avgMsSeries} width={80} height={20} color="var(--wl-blue)" />}
      {fmtMs(c.lastDurationMs)}
    </span>
  );
}

export function ChecksTable(p: TableProps) {
  return <Table paging={{ noun: "checks", key: "checks" }} columns={columns(p)} rows={p.checks} rowKey={(c) => c.id} empty={p.empty} defaultSort={{ key: "state", desc: false }} select={p.select} />;
}
