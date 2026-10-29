import type { ReactNode } from "react";
import { Box, Cpu, Layers, MemoryStick, RotateCcw, Server } from "lucide-react";
import { type ContainerRow, type NodeDetail, type PodDetail, quoteText } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useInfraModel } from "../../data/infra";
import { fmtAgo, fmtCount } from "../../format";
import { hrefTo } from "../../routes";
import { breakable } from "../../ui/breakable";
import { DotText } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { DASH, fmtBytes, fmtCores, fmtRate, InfraCard, InfraHead, LinePanel, NoInfra, ServicesPanel } from "./infraParts";
import { Phase, PodsTable } from "./KubeTables";
import { hostHref, nodeHref, workloadHref } from "./links";

const BACK = hrefTo("kubernetes");

/** CPU on one scale: cores when the line reaches a core, millicores below, so the axis never mixes the two. */
function coresScale(values: readonly (number | null)[]): (v: number) => string {
  const top = Math.max(0, ...values.map((v) => v ?? 0));
  // Under 10 millicores the half steps keep one decimal, so ticks never repeat (0.5, 1, 1.5, not 1, 1, 2).
  return top >= 0.995 ? (v) => `${Number(v.toFixed(2))} cores` : (v) => `${top < 0.01 ? Number((v * 1000).toFixed(1)) : Math.round(v * 1000)} millicores`;
}

function Charts({ d }: { d: NodeDetail | PodDetail }) {
  return (
    <div className="wl-grid wl-grid-3">
      <LinePanel title="CPU Over Time" starts={d.buckets} lines={[{ label: "CPU", values: d.cpu, color: "var(--wl-blue)" }]} format={coresScale(d.cpu)} />
      <LinePanel title="Memory Over Time" starts={d.buckets} lines={[{ label: "Working set", values: d.memory, color: "var(--wl-green)" }]} format={fmtBytes} />
      <LinePanel title="Network Over Time" starts={d.buckets} lines={[{ label: "In", values: d.netIn, color: "var(--wl-blue)" }, { label: "Out", values: d.netOut, color: "var(--wl-orange)" }]} format={fmtRate} />
    </div>
  );
}

/** Loading, errors, and "not found" around a detail page. */
function Frame({ state, what, found, children }: { state: { loading: boolean; error: string | null; supported: boolean; model: unknown }; what: string; found: boolean; children: ReactNode }) {
  return (
    <div className="wl-infra-page wl-svc-page">
      {state.error && <div className="wl-banner wl-banner-error">Could not load {what}: {state.error}</div>}
      {state.loading && !found && <div className="wl-banner wl-banner-info">Loading {what}…</div>}
      {!state.supported && <NoInfra supported={false} what="Kubernetes" />}
      {found ? children : !!state.model && !state.loading && <InfraHead back={BACK} backLabel="Kubernetes" icon={Box} title={what} facts={[["Status", "Sent no metrics in this time range"]]} />}
    </div>
  );
}

function NodeBody({ d, now }: { d: NodeDetail; now: number }) {
  const r = d.row;
  const facts: [string, ReactNode][] = [["Cluster", r.cluster || DASH], ["Pods", fmtCount(r.pods)], ["Last seen", fmtAgo(r.lastSeenMs, now)]];
  if (r.host) facts.push(["Host", <a key="h" href={hostHref(r.name)}>Disks and network</a>]);
  const status = r.ready === null ? undefined : <DotText tone={r.ready ? "success" : "danger"}>{r.ready ? "Ready" : "Not ready"}</DotText>;
  return (
    <>
      <InfraHead back={BACK} backLabel="Kubernetes" icon={Server} title={r.name} status={status} facts={facts} />
      <div className="wl-grid wl-grid-stats">
        <InfraCard icon={Cpu} label="CPU" value={fmtCores(r.cpu)} note={r.cpuAlloc ? `of ${fmtCores(r.cpuAlloc)} allocatable` : "in use"} />
        <InfraCard icon={MemoryStick} label="Memory" value={fmtBytes(r.memory)} note={r.memAlloc ? `of ${fmtBytes(r.memAlloc)} allocatable` : "working set"} />
        <InfraCard icon={Box} label="Pods" value={fmtCount(r.pods)} note={`${fmtCount(r.pending)} pending`} danger={r.pending > 0} />
        <InfraCard icon={RotateCcw} label="Restarts" value={fmtCount(r.restartsNew)} note="in this range" danger={r.restartsNew > 0} />
      </div>
      <Charts d={d} />
      <Panel title="Pods" flush>
        <PodsTable rows={d.pods} onNode empty="No pods on this node in this range." />
      </Panel>
      <ServicesPanel services={d.services} now={now} empty="No service reports a pod on this node as where it runs." />
    </>
  );
}

/** One node: usage over time, its pods, and the services in them. */
export function KubeNodePage({ name }: { name: string }) {
  const state = useInfraModel("kubernetes", { node: name });
  const { updatedMs } = useData();
  const d = state.model?.node?.row.name === name ? state.model.node : null;
  return <Frame state={state} what={name} found={!!d}>{d && <NodeBody d={d} now={updatedMs} />}</Frame>;
}

const CONTAINER_COLUMNS: Column<ContainerRow>[] = [
  { key: "name", header: "Container", cell: (c) => <strong>{c.name}</strong>, sort: (c) => c.name },
  { key: "ready", header: "Ready", cell: (c) => (c.ready === null ? DASH : <DotText tone={c.ready ? "success" : "danger"}>{c.ready ? "Ready" : "Not ready"}</DotText>) },
  { key: "restarts", header: "Restarts", cell: (c) => `${fmtCount(c.restarts)}${c.restartsNew ? ` (+${fmtCount(c.restartsNew)} in range)` : ""}`, num: true, sort: (c) => c.restarts },
  { key: "exit", header: "Last Exit", cell: (c) => (c.lastExit ? <span className={c.lastExit === "OOMKilled" ? "wl-text-error" : undefined}>{c.lastExit === "OOMKilled" ? "Out of memory (OOMKilled)" : c.lastExit}</span> : DASH) },
  { key: "mem", header: "Memory Limit", cell: (c) => fmtBytes(c.memLimit), num: true, className: "wl-hide-sm" },
  { key: "cpu", header: "CPU Limit", cell: (c) => fmtCores(c.cpuLimit), num: true, className: "wl-hide-sm" },
];

function PodBody({ d, now }: { d: PodDetail; now: number }) {
  const r = d.row;
  const facts: [string, ReactNode][] = [["Namespace", r.namespace || DASH], ["Node", r.node ? <a key="n" href={nodeHref(r.node)}>{r.node}</a> : DASH], ["Workload", r.workload ? <a key="w" href={workloadHref(`${r.namespace}/${r.workload}`)}>{breakable(r.workload)}</a> : DASH], ["Last seen", fmtAgo(r.lastSeenMs, now)]];
  if (r.cluster) facts.unshift(["Cluster", r.cluster]);
  facts.push(["Requests", <a key="q" href={hrefTo("search", [], { q: `@k8s.pod.name:${quoteText(r.name)}`, kind: "requests" })}>Requests this pod served</a>]);
  return (
    <>
      <InfraHead back={BACK} backLabel="Kubernetes" icon={Box} title={r.name} status={<Phase phase={r.phase} />} facts={facts} />
      <div className="wl-grid wl-grid-stats">
        <InfraCard icon={Cpu} label="CPU" value={fmtCores(r.cpu)} note="in use now" />
        <InfraCard icon={MemoryStick} label="Memory" value={fmtBytes(r.memory)} note={r.memLimit ? `limit ${fmtBytes(r.memLimit)}` : "working set"} />
        <InfraCard icon={RotateCcw} label="Restarts" value={fmtCount(r.restarts)} note={`${fmtCount(r.restartsNew)} in this range`} danger={r.restartsNew > 0} />
        <InfraCard icon={Layers} label="Containers" value={`${fmtCount(r.ready)} of ${fmtCount(r.containers)}`} note={r.oomKills ? `${fmtCount(r.oomKills)} last stopped out of memory` : "ready"} danger={r.oomKills > 0} />
      </div>
      <Charts d={d} />
      <Panel title="Containers" flush>
        <Table paging={{ noun: "containers", key: "containers" }} columns={CONTAINER_COLUMNS} rows={d.containers} rowKey={(c) => c.name} empty={<Empty title="No containers">k8s_cluster sends no container state for this pod.</Empty>} />
      </Panel>
      <ServicesPanel services={d.services} now={now} empty="No service reports this pod as where it runs." />
    </>
  );
}

/** One pod: phase, usage over time, containers with restarts and last exits, and the services in it. */
export function KubePodPage({ ns, name }: { ns: string; name: string }) {
  const state = useInfraModel("kubernetes", { pod: ns ? `${ns}/${name}` : name });
  const { updatedMs } = useData();
  const d = state.model?.pod?.row.name === name ? state.model.pod : null;
  return <Frame state={state} what={name} found={!!d}>{d && <PodBody d={d} now={updatedMs} />}</Frame>;
}
