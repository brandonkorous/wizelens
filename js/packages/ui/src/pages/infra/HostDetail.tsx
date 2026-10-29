import type { ReactNode } from "react";
import { Cpu, HardDrive, MemoryStick, Network, Server } from "lucide-react";
import type { FileSystemRow, HostDetail as Detail } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useInfraModel } from "../../data/infra";
import { fmtAgo } from "../../format";
import { hrefTo } from "../../routes";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { DASH, fmtBytes, fmtCores, fmtRate, fmtShare, fmtUsed, InfraCard, InfraHead, LinePanel, NoInfra, ServicesPanel, UsageBar } from "./infraParts";
import { nodeHref, podHref } from "./links";

const FS_COLUMNS: Column<FileSystemRow>[] = [
  { key: "mount", header: "Mount", cell: (f) => <strong>{f.mount}</strong>, sort: (f) => f.mount },
  { key: "device", header: "Device", cell: (f) => f.device || DASH, className: "wl-hide-sm" },
  { key: "type", header: "Type", cell: (f) => f.type || DASH, className: "wl-hide-sm" },
  { key: "used", header: "Used", cell: (f) => fmtUsed(f.used, f.total), sort: (f) => f.used ?? 0 },
  { key: "share", header: "Full", cell: (f) => <UsageBar share={f.share} />, sort: (f) => f.share ?? -1 },
];

function Charts({ d }: { d: Detail }) {
  const s = d.buckets;
  return (
    <>
      <div className="wl-grid wl-grid-2-even">
        <LinePanel title="CPU Over Time" starts={s} lines={[{ label: "Busy", values: d.cpu, color: "var(--wl-blue)" }]} format={fmtShare} />
        <LinePanel title="Memory Over Time" starts={s} lines={[{ label: "Used", values: d.memory, color: "var(--wl-green)" }]} format={fmtBytes} />
      </div>
      <div className="wl-grid wl-grid-2-even">
        <LinePanel title="Disk Over Time" starts={s} lines={[{ label: "Read", values: d.diskRead, color: "var(--wl-blue)" }, { label: "Write", values: d.diskWrite, color: "var(--wl-orange)" }]} format={fmtRate} />
        <LinePanel title="Network Over Time" starts={s} lines={[{ label: "In", values: d.netIn, color: "var(--wl-blue)" }, { label: "Out", values: d.netOut, color: "var(--wl-orange)" }]} format={fmtRate} />
      </div>
    </>
  );
}

function Pods({ d }: { d: Detail }) {
  return (
    <Panel title={`Pods on This Node (${d.pods.length})`}>
      <span className="wl-infra-chips">
        {d.pods.map((p) => {
          const [ns, name] = p.includes("/") ? [p.slice(0, p.indexOf("/")), p.slice(p.indexOf("/") + 1)] : ["", p];
          return <a key={p} className="wl-infra-chip" href={podHref(ns, name)}>{p}</a>;
        })}
      </span>
    </Panel>
  );
}

function Body({ d, now }: { d: Detail; now: number }) {
  const r = d.row;
  // The share is the fullest disk's, so its bytes and mount must be that disk's too.
  const fullest = d.fileSystems[0];
  const diskNote = fullest ? `${fmtUsed(fullest.used, fullest.total)} on ${fullest.mount}` : fmtUsed(r.diskUsed, r.diskTotal);
  const facts: [string, ReactNode][] = [["OS", r.os || DASH], ["CPUs", r.cores ? fmtCores(r.cores) : DASH], ["Load (1 min)", r.load1?.toFixed(2) ?? DASH], ["Last seen", fmtAgo(r.lastSeenMs, now)]];
  if (r.cluster) facts.push(["Cluster", r.cluster]);
  if (r.node) facts.push(["Kubernetes", <a key="n" href={nodeHref(r.name)}>Node page</a>]);
  return (
    <>
      <InfraHead back={hrefTo("hosts")} backLabel="All hosts" icon={Server} title={r.name} facts={facts} />
      <div className="wl-grid wl-grid-stats">
        <InfraCard icon={Cpu} label="CPU" value={fmtShare(r.cpu)} note={r.cores ? `of ${fmtCores(r.cores)}` : "busy"} danger={(r.cpu ?? 0) >= 0.9} />
        <InfraCard icon={MemoryStick} label="Memory" value={fmtShare(r.mem)} note={fmtUsed(r.memUsed, r.memTotal)} danger={(r.mem ?? 0) >= 0.9} />
        <InfraCard icon={HardDrive} label="Fullest Disk" value={fmtShare(r.disk)} note={diskNote} danger={(r.disk ?? 0) >= 0.9} />
        <InfraCard icon={Network} label="Network" value={fmtRate((r.netIn ?? 0) + (r.netOut ?? 0))} note={`${fmtRate(r.netIn)} in, ${fmtRate(r.netOut)} out`} />
      </div>
      <Charts d={d} />
      <ServicesPanel services={d.services} now={now} empty="No WizeLens or OpenTelemetry service reports this host (or a pod on it) as where it runs." />
      {d.pods.length > 0 && <Pods d={d} />}
      <Panel title="File Systems" flush>
        <Table paging={{ noun: "file systems", key: "fs" }} columns={FS_COLUMNS} rows={d.fileSystems} rowKey={(f) => f.mount} defaultSort={{ key: "share", desc: true }} empty={<Empty title="No file systems">The collector's filesystem scraper sends none for this host.</Empty>} />
      </Panel>
    </>
  );
}

/** One host on its own page: usage now and over time, its file systems, its services, and its pods when it is a node. */
export function HostDetail({ name }: { name: string }) {
  const state = useInfraModel("hosts", { host: name });
  const { updatedMs } = useData();
  const d = state.model?.selected?.row.name === name ? state.model.selected : null;
  return (
    <div className="wl-infra-page wl-svc-page">
      {state.error && <div className="wl-banner wl-banner-error">Could not load this host: {state.error}</div>}
      {state.loading && !d && <div className="wl-banner wl-banner-info">Loading {name}…</div>}
      {!state.supported && <NoInfra supported={false} what="host" />}
      {d && <Body d={d} now={updatedMs} />}
      {state.model && !state.loading && !d && (
        <InfraHead back={hrefTo("hosts")} backLabel="All hosts" icon={Server} title={name} facts={[["Status", "Sent no host metrics in this time range"]]} />
      )}
    </div>
  );
}
