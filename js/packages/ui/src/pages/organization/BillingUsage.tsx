import { useState } from "react";
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
        <span className="wl-muted">of {fmtGb(included)} included this month ({pct < 1 && pct > 0 ? "under 1%" : `${Math.round(pct)}%`})</span>
      </div>
      <div className={`wl-usage-track ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Data used this month">
        <i style={{ width: `${usage.monthGb > 0 ? Math.max(1.5, pct) : 0}%` }} />
      </div>
    </div>
  );
}

/** "2026-10" as "October 2026". */
const monthName = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-10-28" as "Oct 28". */
const shortDay = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Data per day this month, one slot for every day of the month; a tap names a day, since a phone has no hover title. */
function DayBars({ month, days }: { month: string; days: Usage["days"] }) {
  const [picked, setPicked] = useState<string | null>(null);
  if (!days.length) return <p className="wl-muted wl-small">No data yet this month.</p>;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map(days.map((d) => [d.day, d]));
  const max = Math.max(...days.map((d) => d.gb), 0.000001);
  return (
    <>
      <div className="wl-usage-days" aria-label="Data per day">
        {Array.from({ length: count }, (_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, "0")}`;
          const d = byDay.get(key);
          const title = d ? `${shortDay(key)}: ${fmtGb(d.gb)}, ${d.spans.toLocaleString()} spans, ${d.logs.toLocaleString()} logs, ${d.points.toLocaleString()} metric points` : `${shortDay(key)}: no data`;
          return <span key={key} title={title} className={picked === title ? "wl-picked" : undefined} onClick={() => setPicked(title)}>{d && d.gb > 0 && <i style={{ height: `${Math.max(4, (d.gb / max) * 100)}%` }} />}</span>;
        })}
      </div>
      <div className="wl-usage-axis wl-muted wl-small">
        <span>{shortDay(`${month}-01`)}</span>
        <span>{shortDay(`${month}-${count}`)}</span>
      </div>
      <p className={`wl-usage-day wl-small${picked ? "" : " wl-muted"}`} aria-live="polite">{picked ?? "Pick a day to see its data."}</p>
    </>
  );
}

/** The 1st of the month after `month` ("2026-10"), when extra data is billed. */
const firstOfNext = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/** " (at the rate since Oct 28)" when this month's data started after the 1st. */
const since = (day: string | null) =>
  day && !day.endsWith("-01") ? ` (at the rate since ${new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })})` : "";

/** The next two charges, each with its date: extra data on the 1st, the plan on its renewal day. */
function chargeFacts(usage: Usage): [string, string][] {
  const sub = usage.subscription;
  const price = sub?.interval === "year" ? usage.plan.annualUsd : usage.plan.monthlyUsd;
  const out: [string, string][] = [];
  if (usage.plan.overage) out.push(["Extra data so far", fmtUsd(usage.overageUsd)], [`Projected extra data, billed ${firstOfNext(usage.month)}`, fmtUsd(usage.projectedOverageUsd)]);
  if (sub?.periodEndMs && sub.cancelAtPeriodEnd) out.push(["Plan ends", fmtDate(sub.periodEndMs)]);
  else if (sub?.periodEndMs && price !== null) out.push([`${usage.plan.name} plan, billed ${fmtDate(sub.periodEndMs)}`, fmtUsd(price)]);
  return out;
}

/** The month so far, the projection to month end, and the coming charges. */
export function UsagePanel({ usage }: { usage: Usage }) {
  const extra = usage.plan.overage;
  const facts: [string, string][] = [
    [`Projected by month end${since(usage.projectedFrom)}`, `${fmtGb(usage.projectedGb)}${!extra && usage.includedGb !== null && usage.projectedGb > usage.includedGb ? ` (stops at ${fmtGb(usage.includedGb)})` : ""}`],
    ...chargeFacts(usage),
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
