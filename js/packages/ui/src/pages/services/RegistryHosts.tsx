import { useState } from "react";
import { type HubService, isOldInstance, type ServiceGroup } from "@wizeworks/lens-core";
import { presenceOf } from "../../data/sources";
import { fmtAgo, fmtCount } from "../../format";
import { DotText } from "../../ui/Badges";
import { Check } from "../../ui/Field";
import { Empty, Panel } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

function columns(now: number): Column<HubService>[] {
  return [
    { key: "host", header: "Host", cell: (s) => <strong>{s.host || "–"}</strong>, sort: (s) => s.host ?? "" },
    { key: "status", header: "Status", cell: (s) => <DotText tone={s.online ? "success" : "neutral"}>{presenceOf(s)}</DotText>, sort: (s) => (s.online ? 0 : 1) },
    { key: "version", header: "Version", cell: (s) => s.version ?? "–", className: "wl-hide-sm" },
    { key: "runtime", header: "Runtime", cell: (s) => <span className="wl-muted wl-small">{s.runtime ?? "–"}</span>, className: "wl-hide-sm" },
    { key: "first", header: "First seen", cell: (s) => fmtAgo(s.firstSeenMs, now), sort: (s) => -s.firstSeenMs, className: "wl-hide-sm" },
    { key: "seen", header: "Last seen", cell: (s) => fmtAgo(s.lastSeenMs, now), sort: (s) => -s.lastSeenMs },
  ];
}

/** The hosts (pods) of one service. Hosts offline for more than a day hide until asked for. */
export function RegistryHosts({ group, now, onClose }: { group: ServiceGroup; now: number; onClose: () => void }) {
  const [showOld, setShowOld] = useState(false);
  const old = group.instances.filter((s) => isOldInstance(s, now)).length;
  const rows = showOld ? group.instances : group.instances.filter((s) => !isOldInstance(s, now));
  const title = `Hosts of ${group.service}${group.environment ? ` · ${group.environment}` : ""} (${group.online} of ${group.instances.length} online)`;
  const action = (
    <span className="wl-row-actions">
      {old > 0 && <Check label={`Show old hosts (${fmtCount(old)})`} checked={showOld} onChange={(e) => setShowOld(e.target.checked)} />}
      <button type="button" className="wl-link-btn" onClick={onClose}>Close</button>
    </span>
  );
  return (
    <Panel title={title} flush action={action}>
      <Table columns={columns(now)} rows={rows} rowKey={(s) => s.host ?? ""} defaultSort={{ key: "seen", desc: false }} empty={<Empty title="Only old hosts">Every host of this service has been offline for more than a day.</Empty>} />
    </Panel>
  );
}
