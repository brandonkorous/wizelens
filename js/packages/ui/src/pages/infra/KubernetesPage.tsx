import { Boxes, Clock, RotateCcw, Server, Skull } from "lucide-react";
import type { KubeModel } from "@wizeworks/lens-core/internal";
import { useData } from "../../data/hooks";
import { useInfraModel } from "../../data/infra";
import { fmtCount } from "../../format";
import { hrefTo, setQuery, useRoute } from "../../routes";
import { SearchInput, Select } from "../../ui/Controls";
import { PageHeader, Panel, TabBar } from "../../ui/Panel";
import { KubeNodePage, KubePodPage } from "./KubeDetail";
import { NodesTable, PodsTable, WorkloadsTable } from "./KubeTables";
import { InfraCard, NoInfra } from "./infraParts";
import { partOf } from "./links";
import "../../styles/pages/infra.css";

type View = "pods" | "workloads" | "nodes";
const VIEWS: [View, string][] = [["pods", "Pods"], ["workloads", "Workloads"], ["nodes", "Nodes"]];

function Cards({ m }: { m: KubeModel }) {
  const s = m.summary;
  return (
    <div className="wl-grid wl-grid-stats">
      <InfraCard icon={Server} label="Nodes" value={`${fmtCount(s.readyNodes)} of ${fmtCount(s.nodes)}`} note="ready" danger={s.readyNodes < s.nodes} />
      <InfraCard icon={Boxes} label="Pods" value={fmtCount(s.pods)} note={`${fmtCount(s.running)} running, ${fmtCount(s.failed)} failed`} />
      <InfraCard icon={Clock} label="Pending Pods" value={fmtCount(s.pending)} note="waiting to be scheduled or started" danger={s.pending > 0} />
      <InfraCard icon={RotateCcw} label="Restarts" value={fmtCount(s.restartsNew)} note={<>container restarts in this range · <Skull size={12} aria-hidden={true} /> {fmtCount(s.oomKills)} out of memory</>} danger={s.restartsNew > 0 || s.oomKills > 0} />
    </div>
  );
}

function Filters({ m, q }: { m: KubeModel; q: Record<string, string> }) {
  return (
    <>
      {m.clusters.length > 1 && <Select value={q.cluster ?? ""} options={[["", "All clusters"], ...m.clusters.map((c): [string, string] => [c, c])]} onChange={(v) => setQuery({ cluster: v || null })} label="Cluster" />}
      <Select value={q.ns ?? ""} options={[["", "All namespaces"], ...m.namespaces.map((n): [string, string] => [n, n])]} onChange={(v) => setQuery({ ns: v || null })} label="Namespace" />
      <SearchInput value={q.q ?? ""} onChange={(v) => setQuery({ q: v || null })} placeholder="Find a pod, workload, or node" />
    </>
  );
}

function Overview() {
  const q = Object.fromEntries(useRoute().query);
  const view = (VIEWS.some(([v]) => v === q.view) ? q.view : "pods") as View;
  const state = useInfraModel("kubernetes", { cluster: q.cluster, ns: q.ns, workload: q.workload, q: q.q });
  const { updatedMs } = useData();
  const m = state.model;
  const none = state.supported && m && m.summary.nodes === 0 && m.summary.pods === 0 && !q.q && !q.ns && !q.workload;
  return (
    <div className="wl-infra-page">
      <PageHeader title="Kubernetes" subtitle="Clusters, nodes, workloads, and pods: what runs where, what restarts, and what waits.">
        {m && !none && <Filters m={m} q={q} />}
      </PageHeader>
      {state.error && <div className="wl-banner wl-banner-error">Could not load Kubernetes: {state.error}</div>}
      {state.loading && !m && <div className="wl-banner wl-banner-info">Loading Kubernetes…</div>}
      {(!state.supported || none) && <NoInfra supported={state.supported} what="Kubernetes" />}
      {m && !none && (
        <>
          <Cards m={m} />
          {q.workload && (
            <div className="wl-banner wl-banner-info">
              Showing the pods of {q.workload.split("/").slice(1).join(" ")}. <a href={hrefTo("kubernetes", [], { view: "pods" })}>Show all pods</a>
            </div>
          )}
          <Panel flush title={<TabBar tabs={VIEWS} value={view} onChange={(v) => setQuery({ view: v === "pods" ? null : v })} />}>
            {view === "pods" && <PodsTable rows={m.pods} />}
            {view === "workloads" && <WorkloadsTable rows={m.workloads} />}
            {view === "nodes" && <NodesTable rows={m.nodes} now={updatedMs} />}
          </Panel>
        </>
      )}
    </div>
  );
}

/** The cluster overview, or one node (`#/kubernetes/node/<name>`) or pod (`#/kubernetes/pod/<namespace>/<name>`). */
export function KubernetesPage() {
  const [kind, a, b] = useRoute().params;
  if (kind === "node" && a) return <KubeNodePage key={a} name={partOf(a)} />;
  if (kind === "pod" && a && b) return <KubePodPage key={`${a}/${b}`} ns={partOf(a) === "-" ? "" : partOf(a)} name={partOf(b)} />;
  return <Overview />;
}
