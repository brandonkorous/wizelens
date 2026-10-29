import { Box, Cpu, MemoryStick, Server } from "lucide-react";
import type { HostRow, HostsModel } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useInfraModel } from "../../data/infra";
import { fmtAgo, fmtCount } from "../../format";
import { navigate, setQuery, useRoute } from "../../routes";
import { SearchInput } from "../../ui/Controls";
import { Empty, PageHeader, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { HostDetail } from "./HostDetail";
import { DASH, fmtRate, fmtShare, InfraCard, NoInfra, UsageBar } from "./infraParts";
import { hostHref, nodeHref, partOf, serviceHref } from "./links";
import "../../styles/pages/infra.css";

function columns(now: number): Column<HostRow>[] {
  return [
    { key: "name", header: "Host", cell: (h) => <a href={hostHref(h.name)}><strong>{h.name}</strong></a>, sort: (h) => h.name },
    { key: "cpu", header: "CPU", cell: (h) => <UsageBar share={h.cpu} />, sort: (h) => h.cpu ?? -1 },
    { key: "mem", header: "Memory", cell: (h) => <UsageBar share={h.mem} />, sort: (h) => h.mem ?? -1 },
    { key: "disk", header: "Disk", cell: (h) => <UsageBar share={h.disk} />, sort: (h) => h.disk ?? -1 },
    { key: "net", header: "Network In / Out", cell: (h) => `${fmtRate(h.netIn)} / ${fmtRate(h.netOut)}`, sort: (h) => (h.netIn ?? 0) + (h.netOut ?? 0), className: "wl-hide-sm" },
    {
      key: "services",
      header: "Services",
      cell: (h) => (h.services.length ? <span className="wl-infra-chips">{h.services.map((s) => <a key={s} className="wl-infra-chip" href={serviceHref(s)}>{s}</a>)}</span> : <span className="wl-muted">{DASH}</span>),
      sort: (h) => h.services.length,
    },
    { key: "node", header: "Kubernetes", cell: (h) => (h.node ? <a href={nodeHref(h.name)}>Node</a> : <span className="wl-muted">{DASH}</span>), className: "wl-hide-sm" },
    { key: "seen", header: "Last seen", cell: (h) => fmtAgo(h.lastSeenMs, now), sort: (h) => -h.lastSeenMs, className: "wl-hide-sm" },
  ];
}

function Cards({ m }: { m: HostsModel }) {
  return (
    <div className="wl-grid wl-grid-stats">
      <InfraCard icon={Server} label="Hosts" value={fmtCount(m.summary.hosts)} note="sending host metrics" />
      <InfraCard icon={Cpu} label="Avg CPU" value={fmtShare(m.summary.cpu)} note="busy, across hosts" />
      <InfraCard icon={MemoryStick} label="Avg Memory" value={fmtShare(m.summary.mem)} note="used, across hosts" />
      <InfraCard icon={Box} label="Services" value={fmtCount(m.summary.services)} note="running on these hosts" />
    </div>
  );
}

function AllHosts() {
  const q = useRoute().query.get("q") ?? "";
  const state = useInfraModel("hosts", { q });
  const { updatedMs } = useData();
  const m = state.model;
  const none = state.supported && m && m.hosts.length === 0 && !q;
  return (
    <div className="wl-infra-page">
      <PageHeader title="Hosts" subtitle="CPU, memory, disks, and network of every host, and the services that run on it.">
        {state.supported && <SearchInput value={q} onChange={(v) => setQuery({ q: v || null })} placeholder="Find a host or service" />}
      </PageHeader>
      {state.error && <div className="wl-banner wl-banner-error">Could not load hosts: {state.error}</div>}
      {state.loading && !m && <div className="wl-banner wl-banner-info">Loading hosts…</div>}
      {(!state.supported || none) && <NoInfra supported={state.supported} what="host" />}
      {m && !none && (
        <>
          <Cards m={m} />
          <Panel title="All Hosts" flush>
            <Table paging={{ noun: "hosts", key: "hosts", reset: q }} columns={columns(updatedMs)} rows={m.hosts} rowKey={(h) => h.name} onRowClick={(h) => navigate(hostHref(h.name))} defaultSort={{ key: "name", desc: false }} empty={<Empty title="No hosts match">Clear the search to see every host.</Empty>} />
          </Panel>
        </>
      )}
    </div>
  );
}

/** Every host that sends hostmetrics, or one host on its own page. */
export function HostsPage() {
  const [id] = useRoute().params;
  return id ? <HostDetail key={id} name={partOf(id)} /> : <AllHosts />;
}
