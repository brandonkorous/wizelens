import { useMemo, useState } from "react";
import { avgOf, percentileOf, type RequestRow } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { BarList, type BarItem } from "../../ui/BarList";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";

type Stat = "avg" | "p95";

const PARTS: { key: string; label: string; pick: (r: RequestRow) => number | null; shade: number }[] = [
  { key: "request", label: "Request", pick: (r) => r.durationMs, shade: 100 },
  { key: "server", label: "Server", pick: (r) => r.serverMs, shade: 70 },
  { key: "database", label: "Database", pick: (r) => (r.serverMs === null ? null : r.dbMs), shade: 55 },
  { key: "render", label: "Render", pick: (r) => r.renderMs, shade: 42 },
  { key: "network", label: "Network", pick: (r) => r.networkMs, shade: 30 },
];

function statOf(values: number[], stat: Stat): number | null {
  return stat === "avg" ? avgOf(values) : percentileOf(values, 95);
}

function itemsOf(rows: readonly RequestRow[], stat: Stat): BarItem[] {
  return PARTS.map((p) => {
    const values = rows.map(p.pick).filter((v): v is number => v !== null);
    const value = statOf(values, stat);
    return { key: p.key, label: p.label, value: value ?? 0, display: fmtMs(value), color: `color-mix(in srgb, var(--wl-blue) ${p.shade}%, transparent)` };
  });
}

/** Where request time goes on average (or at p95): server, database, render, and network. */
export function TimingPanel({ rows }: { rows: readonly RequestRow[] }) {
  const [stat, setStat] = useState<Stat>("avg");
  const items = useMemo(() => itemsOf(rows, stat), [rows, stat]);
  const action = <Select<Stat> small label="Statistic" value={stat} onChange={setStat} options={[["avg", "Avg duration"], ["p95", "p95 duration"]]} />;
  return (
    <Panel title="Request Timing Breakdown" action={action}>
      {rows.length === 0 ? <Empty>No requests in this range.</Empty> : <BarList items={items} />}
      {rows.length > 0 && <p className="wl-ov-note">Render and network need the browser add-on. A dash means it was not measured.</p>}
    </Panel>
  );
}
