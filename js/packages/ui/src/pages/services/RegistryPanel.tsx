import type { HubService } from "@wizeworks/lens-core";
import { useData } from "../../data/hooks";
import { useEnvScope, useProjectScope } from "../../data/prefs";
import { inScope, presenceOf } from "../../data/sources";
import { fmtAgo, fmtCount } from "../../format";
import { Badge, DotText } from "../../ui/Badges";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

const keyOf = (s: HubService) => `${s.project ?? ""}|${s.service}|${s.environment ?? ""}|${s.host ?? ""}`;

function columns(now: number): Column<HubService>[] {
  return [
    { key: "service", header: "Service", cell: (s) => <strong>{s.service}</strong>, sort: (s) => s.service },
    { key: "status", header: "Status", cell: (s) => <DotText tone={s.online ? "success" : "neutral"}>{presenceOf(s)}</DotText>, sort: (s) => (s.online ? 0 : 1) },
    { key: "project", header: "Project", cell: (s) => s.project ?? "–", sort: (s) => s.project ?? "" },
    { key: "env", header: "Environment", cell: (s) => s.environment ?? "–", sort: (s) => s.environment ?? "" },
    { key: "host", header: "Host", cell: (s) => s.host ?? "–", className: "wl-hide-sm" },
    { key: "via", header: "Sends with", cell: (s) => <Badge tone={s.via === "addon" ? "info" : "neutral"}>{s.via === "addon" ? "WizeLens" : "OTLP"}</Badge> },
    { key: "runtime", header: "Runtime", cell: (s) => <span className="wl-muted wl-small">{s.runtime ?? "–"}</span>, className: "wl-hide-sm" },
    { key: "seen", header: "Last seen", cell: (s) => fmtAgo(s.lastSeenMs, now), sort: (s) => -s.lastSeenMs },
  ];
}

/** Every service that sends to this hub, with when the hub last heard from it. Hub only. */
export function RegistryPanel() {
  const { registry, updatedMs } = useData();
  const [env] = useEnvScope();
  const [project] = useProjectScope();
  if (!registry) return null;
  const rows = registry.services.filter((s) => inScope(s, { env, project }));
  const online = rows.filter((s) => s.online).length;
  const title = `Connected to this hub (${online} of ${rows.length} online)`;
  return (
    <Panel title={title} flush action={<span className="wl-muted wl-small">{fmtCount(registry.traces)} traces kept</span>}>
      <Table columns={columns(updatedMs)} rows={rows} rowKey={keyOf} defaultSort={{ key: "status", desc: false }} empty={<Empty title="No service has sent data yet">See Settings to connect one.</Empty>} />
    </Panel>
  );
}
