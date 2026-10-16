import { useState } from "react";
import type { OverviewModel } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { BarList, type BarItem } from "../../ui/BarList";
import { Select } from "../../ui/Controls";
import { Empty, Panel } from "../../ui/Panel";

type Stat = "avg" | "p95";

const itemsOf = (m: OverviewModel, stat: Stat): BarItem[] =>
  m.timing.map((p) => ({ key: p.key, label: p.label, value: p[stat] ?? 0, display: fmtMs(p[stat]), color: `color-mix(in srgb, var(--wl-blue) ${p.shade}%, transparent)` }));

/** Where request time goes on average (or at p95): server, database, render, and network. */
export function TimingPanel({ m }: { m: OverviewModel }) {
  const [stat, setStat] = useState<Stat>("avg");
  const action = <Select<Stat> small label="Statistic" value={stat} onChange={setStat} options={[["avg", "Avg duration"], ["p95", "p95 duration"]]} />;
  return (
    <Panel title="Request Timing Breakdown" action={action}>
      {m.empty ? <Empty>No requests in this range.</Empty> : <BarList items={itemsOf(m, stat)} />}
      {!m.empty && <p className="wl-ov-note">Render and network need the browser add-on. A dash means it was not measured.</p>}
    </Panel>
  );
}
