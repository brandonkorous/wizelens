import { useState } from "react";
import { groupServices, type ServiceGroup } from "@wizeworks/lens-core";
import { currentProject, useAccount } from "../../data/account";
import { apiSend } from "../../data/api";
import { useData } from "../../data/hooks";
import { useHost } from "../../data/host";
import { useEnvScope, useProjectScope } from "../../data/prefs";
import { provider } from "../../data/provider";
import { inScope, presenceOf } from "../../data/sources";
import { act } from "../../data/useApi";
import { fmtAgo, fmtCount } from "../../format";
import { Badge, DotText } from "../../ui/Badges";
import { useAsk } from "../../ui/Dialog";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { canManage } from "../team/teamTypes";
import { RegistryHosts } from "./RegistryHosts";

const statusOf = (g: ServiceGroup) => (g.online > 0 ? "Online" : presenceOf(g.newest));
const hostsText = (g: ServiceGroup) => (g.instances.length === 1 ? "1" : `${fmtCount(g.online)} of ${fmtCount(g.instances.length)} online`);

function columns(now: number): Column<ServiceGroup>[] {
  return [
    { key: "service", header: "Service", cell: (g) => <strong>{g.service}</strong>, sort: (g) => g.service },
    { key: "status", header: "Status", cell: (g) => <DotText tone={g.online > 0 ? "success" : "neutral"}>{statusOf(g)}</DotText>, sort: (g) => (g.online > 0 ? 0 : 1) },
    { key: "project", header: "Project", cell: (g) => g.project ?? "–", sort: (g) => g.project ?? "" },
    { key: "env", header: "Environment", cell: (g) => g.environment ?? "–", sort: (g) => g.environment ?? "" },
    { key: "hosts", header: "Hosts", cell: hostsText, sort: (g) => -g.instances.length },
    { key: "via", header: "Sends with", cell: (g) => <Badge tone={g.newest.via === "addon" ? "info" : "neutral"}>{g.newest.via === "addon" ? "WizeLens" : "OTLP"}</Badge> },
    { key: "runtime", header: "Runtime", cell: (g) => <span className="wl-muted wl-small">{g.newest.runtime ?? "–"}</span>, className: "wl-hide-sm" },
    { key: "seen", header: "Last seen", cell: (g) => fmtAgo(g.newest.lastSeenMs, now), sort: (g) => -g.newest.lastSeenMs },
  ];
}

/** "Forget offline hosts" for cloud admins: old pods leave the list; each service keeps its newest host. */
function useForget(offline: number) {
  const [project] = useProjectScope();
  const role = currentProject(useAccount())?.org.role;
  const cloud = useHost().has("accounts");
  const { dialog, confirm } = useAsk();
  const [note, setNote] = useState<string | null>(null);
  const run = async () => {
    const body = "Hosts that are offline leave this list. Each service keeps its newest host. Traces stay, and a host that sends again comes back.";
    if (!(await confirm({ title: "Forget offline hosts?", body, confirmLabel: "Forget hosts" }))) return;
    let removed = 0;
    const err = await act(async () => (removed = (await apiSend<{ removed: number }>("POST", `./api/projects/${project}/services/forget`)).removed), () => provider.refresh());
    setNote(err ?? `Forgot ${fmtCount(removed)} offline ${removed === 1 ? "host" : "hosts"}.`);
  };
  const button = cloud && project && canManage(role) && offline > 0 ? <button type="button" className="wl-link-btn" onClick={() => void run()}>Forget offline hosts</button> : null;
  return { button, dialog, note };
}

/** Every service that sends to this hub or cloud, one row per service. Click a row for its hosts (pods). Hub and cloud only. */
export function RegistryPanel() {
  const { registry, updatedMs } = useData();
  const [env] = useEnvScope();
  const [project] = useProjectScope();
  const cloud = useHost().has("accounts");
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupServices((registry?.services ?? []).filter((s) => inScope(s, { env, project }, !cloud)));
  // What the cloud forgets: offline hosts that are not the newest of their service.
  const forget = useForget(groups.reduce((n, g) => n + g.instances.slice(1).filter((s) => !s.online).length, 0));
  if (!registry) return null;
  const selected = groups.find((g) => g.key === open);
  const online = groups.filter((g) => g.online > 0).length;
  const title = `Sending to this ${cloud ? "project" : "hub"} (${online} of ${groups.length} online)`;
  const action = (
    <span className="wl-row-actions">
      {forget.button}
      <span className="wl-muted wl-small">{fmtCount(registry.traces)} traces kept</span>
    </span>
  );
  return (
    <>
      <Panel title={title} flush action={action}>
        {forget.note && <div className="wl-banner wl-banner-info wl-panel-banner">{forget.note}</div>}
        <Table columns={columns(updatedMs)} rows={groups} rowKey={(g) => g.key} onRowClick={(g) => setOpen(g.key === open ? null : g.key)} selectedKey={open} defaultSort={{ key: "status", desc: false }} empty={<Empty title="No service has sent data yet"><a href="#/settings/connect">Connect one</a> in Settings.</Empty>} />
        {forget.dialog}
      </Panel>
      {selected && <RegistryHosts key={selected.key} group={selected} now={updatedMs} onClose={() => setOpen(null)} />}
    </>
  );
}
