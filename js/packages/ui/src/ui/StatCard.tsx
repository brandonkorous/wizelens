import type { ComponentType } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { fmtPct } from "../format";
import { Sparkline } from "./Sparkline";

export interface StatCardProps {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  /** Percent change against the previous period. Null hides the change. */
  change: number | null;
  /** True when a rising value is good (requests), false when it is bad (errors, duration). */
  upIsGood: boolean;
  compareLabel: string;
  series?: (number | null)[];
  danger?: boolean;
}

function Change({ change, upIsGood, compareLabel }: Pick<StatCardProps, "change" | "upIsGood" | "compareLabel">) {
  if (change === null) return <div className="wl-delta"><b className="wl-flat">No data</b><span>{compareLabel.replace(/^vs\. /, "for ")}</span></div>;
  const flat = Math.abs(change) < 0.5;
  const good = change > 0 === upIsGood;
  const Arrow = change >= 0 ? ArrowUp : ArrowDown;
  return (
    <div className="wl-delta">
      <b className={flat ? "wl-flat" : good ? "wl-good" : "wl-bad"}>
        {!flat && <Arrow aria-hidden="true" />}
        {fmtPct(Math.abs(change))}
      </b>
      <span>{compareLabel}</span>
    </div>
  );
}

/** A number card: icon, label, value, change against the previous period, and a sparkline. */
export function StatCard({ icon: Icon, label, value, change, upIsGood, compareLabel, series, danger = false }: StatCardProps) {
  return (
    <section className="wl-panel wl-stat">
      <Icon className={`wl-stat-icon${danger ? " wl-danger" : ""}`} aria-hidden={true} />
      <div className="wl-stat-label">{label}</div>
      <div />
      <div className="wl-stat-value">{value}</div>
      <div className="wl-stat-foot">
        <Change change={change} upIsGood={upIsGood} compareLabel={compareLabel} />
      </div>
      {series && <div className="wl-stat-spark"><Sparkline values={series} width={240} height={28} stretch color={danger ? "var(--wl-red)" : "var(--wl-blue)"} /></div>}
    </section>
  );
}
