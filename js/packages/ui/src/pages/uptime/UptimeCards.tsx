import { CircleCheck, Clock, HeartPulse, TriangleAlert } from "lucide-react";
import { percentChange, tlsDaysLeft, tlsWarns, type UptimeCheckView, type UptimeModel } from "@wizeworks/lens-core";
import { fmtCount, fmtMs } from "../../format";
import { StatCard } from "../../ui/StatCard";
import { fmtUptime } from "./uptimeParts";

const avgOf = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
};

/** Checks up, uptime over 24 hours, response time, and failed runs in the range. */
export function UptimeCards({ checks, model }: { checks: readonly UptimeCheckView[]; model: UptimeModel | null }) {
  const on = checks.filter((c) => c.enabled);
  const up = on.filter((c) => c.state === "up").length;
  const t = model?.totals;
  const hasPrev = !!model?.meta.hasPrev;
  const change = (a: number | null | undefined, b: number | null | undefined) => (hasPrev && a != null ? percentChange(a, b ?? 0) : null);
  const compareLabel = model?.meta.compareLabel ?? "";
  const failRate = (model?.checks ?? []).length ? model!.starts.map((_, i) => model!.checks.reduce((s, c) => s + (c.failSeries[i] ?? 0), 0)) : undefined;
  return (
    <div className="wl-grid wl-grid-stats">
      <StatCard icon={CircleCheck} label="Checks Up" value={on.length ? `${up} of ${on.length}` : "–"} change={null} upIsGood compareLabel="" note={on.length - up > 0 ? `${on.length - up} not up` : "All up"} />
      <StatCard icon={HeartPulse} label="Uptime (24 h)" value={fmtUptime(avgOf(on.map((c) => c.uptime["24h"])))} change={null} upIsGood compareLabel="" note="Average of the checks that are on" />
      <StatCard icon={Clock} label="Avg Response" value={fmtMs(t?.avgMs)} change={change(t?.avgMs, t?.prevAvgMs)} upIsGood={false} compareLabel={compareLabel} />
      <StatCard icon={TriangleAlert} label="Failed Runs" value={fmtCount(t?.failures ?? 0)} change={change(t?.failures, t?.prevFailures)} upIsGood={false} compareLabel={compareLabel} series={failRate} danger />
    </div>
  );
}

/** A warning per certificate that ends within 14 days, or has ended. */
export function CertWarnings({ checks, nowMs }: { checks: readonly UptimeCheckView[]; nowMs: number }) {
  const soon = checks.filter((c) => c.enabled && tlsWarns(c.tlsExpiresMs, nowMs));
  if (soon.length === 0) return null;
  return (
    <div className="wl-banner wl-banner-warning wl-uptime-certs" role="status">
      {soon.map((c) => {
        const days = tlsDaysLeft(c.tlsExpiresMs, nowMs)!;
        return <div key={c.id}><strong>{c.name}:</strong> {days < 0 ? "the TLS certificate has expired." : `the TLS certificate expires in ${days} ${days === 1 ? "day" : "days"}.`} Renew it before visitors see a warning.</div>;
      })}
    </div>
  );
}
