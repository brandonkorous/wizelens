import { fmtGb, fmtUsd, type Usage } from "../../data/billing";
import { fmtDate } from "../../format";
import { Panel } from "../../ui/Panel";

/** This month's GB against the included GB: blue below 80%, amber from 80%, red at the Free cap. */
export function UsageBar({ usage }: { usage: Usage }) {
  const included = usage.includedGb;
  if (included === null) return <p className="wl-muted">{fmtGb(usage.monthGb)} this month. This plan has no data limit.</p>;
  const pct = Math.min(100, (usage.monthGb / included) * 100);
  const tone = usage.blocked ? "wl-usage-full" : pct >= 80 ? "wl-usage-warn" : "";
  return (
    <div className="wl-usage">
      <div className="wl-usage-head">
        <strong>{fmtGb(usage.monthGb)}</strong>
        <span className="wl-muted">of {fmtGb(included)} included this month</span>
      </div>
      <div className={`wl-usage-track ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Data used this month">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** "2026-10" as "October 2026". */
const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

/** Data per day this month, one slot for every day of the month. */
function DayBars({ month, days }: { month: string; days: Usage["days"] }) {
  if (!days.length) return <p className="wl-muted wl-small">No data yet this month.</p>;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map(days.map((d) => [d.day, d]));
  const max = Math.max(...days.map((d) => d.gb), 0.000001);
  return (
    <div className="wl-usage-days" aria-label="Data per day">
      {Array.from({ length: count }, (_, i) => {
        const key = `${month}-${String(i + 1).padStart(2, "0")}`;
        const d = byDay.get(key);
        const title = d ? `${key}: ${fmtGb(d.gb)}, ${d.spans.toLocaleString()} spans, ${d.logs.toLocaleString()} logs, ${d.points.toLocaleString()} metric points` : `${key}: no data`;
        return <span key={key} title={title}>{d && d.gb > 0 && <i style={{ height: `${Math.max(4, (d.gb / max) * 100)}%` }} />}</span>;
      })}
    </div>
  );
}

/** The month so far, the projection to month end, and what extra data costs. */
export function UsagePanel({ usage }: { usage: Usage }) {
  const extra = usage.plan.overage;
  const sub = usage.subscription;
  const facts: [string, string][] = [
    ["Projected by month end", `${fmtGb(usage.projectedGb)}${!extra && usage.includedGb !== null && usage.projectedGb > usage.includedGb ? ` (stops at ${fmtGb(usage.includedGb)})` : ""}`],
    ...(extra ? ([["Extra data so far", fmtUsd(usage.overageUsd)], ["Projected extra data", fmtUsd(usage.projectedOverageUsd)]] as [string, string][]) : []),
    ...(sub?.periodEndMs ? ([[sub.cancelAtPeriodEnd ? "Plan ends" : "Renews", fmtDate(sub.periodEndMs)]] as [string, string][]) : []),
  ];
  return (
    <Panel title={`Usage in ${monthName(usage.month)}`}>
      {usage.blocked && <div className="wl-banner wl-banner-error">{usage.blocked}</div>}
      <UsageBar usage={usage} />
      <dl className="wl-usage-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <DayBars month={usage.month} days={usage.days} />
      <p className="wl-muted wl-small">A GB is the size of the data your apps send, as sent. Months are calendar months in UTC.</p>
    </Panel>
  );
}
