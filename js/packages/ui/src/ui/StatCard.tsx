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
  /** The list behind the number; the whole card links there. */
  href?: string;
  /** Words in place of the change, for numbers without one (an Apdex rating and its target). */
  note?: string;
}

function Change({ change, upIsGood, compareLabel }: Pick<StatCardProps, "change" | "upIsGood" | "compareLabel">) {
  // No earlier data: say so once, quietly, and not as "No data" beside a number that has some.
  if (change === null) return <div className="wl-delta"><span>{compareLabel.replace(/^vs\. /, "Nothing to compare in the ")}</span></div>;
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
export function StatCard({ icon: Icon, label, value, change, upIsGood, compareLabel, series, danger = false, href, note }: StatCardProps) {
  const Box = href ? "a" : "section";
  return (
    <Box className={`wl-panel wl-stat${href ? " wl-stat-link" : ""}`} {...(href ? { href, title: `See the ${label.toLowerCase()}` } : {})}>
      <Icon className={`wl-stat-icon${danger ? " wl-danger" : ""}`} aria-hidden={true} />
      <div className="wl-stat-label">{label}</div>
      <div />
      <div className="wl-stat-value">{value}</div>
      <div className="wl-stat-foot">
        {note ? <div className="wl-delta"><span>{note}</span></div> : <Change change={change} upIsGood={upIsGood} compareLabel={compareLabel} />}
      </div>
      {series && <div className="wl-stat-spark"><Sparkline values={series} width={240} height={28} stretch color={danger ? "var(--wl-red)" : "var(--wl-blue)"} /></div>}
    </Box>
  );
}
