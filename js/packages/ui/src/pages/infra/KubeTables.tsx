import type { NodeRow, PodRow, WorkloadRow } from "@wizeworks/lens-core";
import { fmtAgo, fmtCount } from "../../format";
import { Badge, DotText, type Tone } from "../../ui/Badges";
import { Empty } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { DASH, fmtBytes, fmtCores, UsageBar } from "./infraParts";
import { hostHref, nodeHref, podHref, serviceHref, workloadHref } from "./links";

const PHASE_TONE: Record<string, Tone> = { Running: "success", Pending: "warning", Failed: "danger", Succeeded: "neutral", Unknown: "neutral" };
const share = (used: number | null, total: number | null) => (used !== null && total ? used / total : null);
const count = (n: number, bad = false) => (n > 0 ? <strong className={bad ? "wl-text-error" : undefined}>{fmtCount(n)}</strong> : <span className="wl-muted">0</span>);

export function Phase({ phase }: { phase: string }) {
  return phase ? <DotText tone={PHASE_TONE[phase] ?? "neutral"}>{phase}</DotText> : <span className="wl-muted">Unknown</span>;
}

const NODE_COLUMNS = (now: number): Column<NodeRow>[] => [
  { key: "name", header: "Node", cell: (n) => <a href={nodeHref(n.name)}><strong>{n.name}</strong></a>, sort: (n) => n.name },
  { key: "ready", header: "Status", cell: (n) => (n.ready === null ? <span className="wl-muted">{DASH}</span> : <DotText tone={n.ready ? "success" : "danger"}>{n.ready ? "Ready" : "Not ready"}</DotText>), sort: (n) => (n.ready ? 0 : 1) },
  { key: "cpu", header: "CPU", cell: (n) => <UsageBar share={share(n.cpu, n.cpuAlloc)} text={fmtCores(n.cpu)} of="allocatable" />, sort: (n) => n.cpu ?? -1 },
  { key: "mem", header: "Memory", cell: (n) => <UsageBar share={share(n.memory, n.memAlloc)} text={fmtBytes(n.memory)} of="allocatable" />, sort: (n) => n.memory ?? -1 },
  { key: "pods", header: "Pods", cell: (n) => fmtCount(n.pods), num: true, sort: (n) => n.pods },
  { key: "pending", header: "Pending", cell: (n) => count(n.pending, true), num: true, sort: (n) => n.pending, className: "wl-hide-sm" },
  { key: "restarts", header: "Restarts", cell: (n) => count(n.restartsNew, true), num: true, sort: (n) => n.restartsNew, className: "wl-hide-sm" },
  { key: "host", header: "Host", cell: (n) => (n.host ? <a href={hostHref(n.name)}>Host page</a> : <span className="wl-muted">{DASH}</span>), className: "wl-hide-sm" },
  { key: "seen", header: "Last seen", cell: (n) => fmtAgo(n.lastSeenMs, now), sort: (n) => -n.lastSeenMs, className: "wl-hide-sm" },
];

export function NodesTable({ rows, now }: { rows: NodeRow[]; now: number }) {
  return <Table paging={{ noun: "nodes", key: "nodes" }} columns={NODE_COLUMNS(now)} rows={rows} rowKey={(n) => n.name} defaultSort={{ key: "name", desc: false }} empty={<Empty title="No nodes">kubeletstats sends nothing yet.</Empty>} />;
}

const WORKLOAD_COLUMNS: Column<WorkloadRow>[] = [
  { key: "name", header: "Workload", cell: (w) => <a href={workloadHref(w.key)}><strong>{w.name}</strong></a>, sort: (w) => w.name },
  { key: "kind", header: "Kind", cell: (w) => <Badge tone="neutral">{w.kind}</Badge>, sort: (w) => w.kind },
  { key: "ns", header: "Namespace", cell: (w) => w.namespace || DASH, sort: (w) => w.namespace, className: "wl-hide-sm" },
  {
    key: "ready",
    header: "Ready",
    cell: (w) => (w.desired === null ? <span className="wl-muted">{DASH}</span> : <span className={(w.ready ?? 0) < w.desired ? "wl-text-error" : undefined}>{`${fmtCount(w.ready)} of ${fmtCount(w.desired)}`}</span>),
    sort: (w) => (w.desired ? (w.ready ?? 0) / w.desired : 1),
  },
  { key: "pods", header: "Pods", cell: (w) => fmtCount(w.pods), num: true, sort: (w) => w.pods },
  { key: "pending", header: "Pending", cell: (w) => count(w.pending, true), num: true, sort: (w) => w.pending },
  { key: "restarts", header: "Restarts", cell: (w) => count(w.restartsNew, true), num: true, sort: (w) => w.restartsNew },
  { key: "oom", header: "OOM Killed", cell: (w) => count(w.oomKills, true), num: true, sort: (w) => w.oomKills },
];

export function WorkloadsTable({ rows }: { rows: WorkloadRow[] }) {
  return <Table paging={{ noun: "workloads", key: "workloads" }} columns={WORKLOAD_COLUMNS} rows={rows} rowKey={(w) => w.key} defaultSort={{ key: "name", desc: false }} empty={<Empty title="No workloads">k8s_cluster sends nothing yet, or no pod names its workload.</Empty>} />;
}

const POD_COLUMNS: Column<PodRow>[] = [
  { key: "name", header: "Pod", cell: (p) => <a href={podHref(p.namespace, p.name)}><strong>{p.name}</strong></a>, sort: (p) => p.name },
  { key: "ns", header: "Namespace", cell: (p) => p.namespace || DASH, sort: (p) => p.namespace, className: "wl-hide-sm" },
  { key: "phase", header: "Phase", cell: (p) => <Phase phase={p.phase} />, sort: (p) => p.phase },
  { key: "node", header: "Node", cell: (p) => (p.node ? <a href={nodeHref(p.node)}>{p.node}</a> : <span className="wl-muted">{DASH}</span>), sort: (p) => p.node, className: "wl-hide-sm" },
  { key: "cpu", header: "CPU", cell: (p) => fmtCores(p.cpu), num: true, sort: (p) => p.cpu ?? -1 },
  { key: "mem", header: "Memory", cell: (p) => <UsageBar share={share(p.memory, p.memLimit)} text={fmtBytes(p.memory)} of="the limit" />, sort: (p) => p.memory ?? -1 },
  { key: "restarts", header: "Restarts", cell: (p) => (p.restartsNew > 0 ? <strong className="wl-text-error">{`${fmtCount(p.restarts)} (+${fmtCount(p.restartsNew)})`}</strong> : fmtCount(p.restarts)), num: true, sort: (p) => p.restartsNew * 1e6 + p.restarts },
  { key: "oom", header: "OOM Killed", cell: (p) => count(p.oomKills, true), num: true, sort: (p) => p.oomKills, className: "wl-hide-sm" },
  {
    key: "services",
    header: "Services",
    cell: (p) => (p.services.length ? <span className="wl-infra-chips">{p.services.map((s) => <a key={s} className="wl-infra-chip" href={serviceHref(s)}>{s}</a>)}</span> : <span className="wl-muted">{DASH}</span>),
    sort: (p) => p.services.length,
    className: "wl-hide-sm",
  },
];

export function PodsTable({ rows, empty = "No pods match these filters." }: { rows: PodRow[]; empty?: string }) {
  return <Table paging={{ noun: "pods", key: "pods" }} columns={POD_COLUMNS} rows={rows} rowKey={(p) => p.key} defaultSort={{ key: "name", desc: false }} empty={<Empty title="No pods">{empty}</Empty>} />;
}
