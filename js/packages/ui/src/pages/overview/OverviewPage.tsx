import { useMemo } from "react";
import { insightGroups } from "@wizeworks/lens-core";
import { useWindowed } from "../../data/hooks";
import { PageHeader } from "../../ui/Panel";
import { ActivityPanel } from "./ActivityPanel";
import { LatestInsights } from "./LatestInsights";
import { OverviewCards } from "./OverviewCards";
import { RecentRequestsPanel } from "./RecentRequestsPanel";
import { ServicesPanel } from "./ServicesPanel";
import { TimingPanel } from "./TimingPanel";
import "../../styles/pages/overview.css";

export function OverviewPage() {
  const w = useWindowed();
  const insights = useMemo(() => insightGroups(w.traces), [w.traces]);
  const prevInsights = useMemo(() => insightGroups(w.prevTraces), [w.prevTraces]);
  return (
    <>
      <PageHeader title="Overview" subtitle="Recent request-level diagnostics across your stack." />
      {w.loading && <div className="wl-banner wl-banner-info">Loading traces…</div>}
      <OverviewCards w={w} insights={insights} prevInsights={prevInsights} />
      <div className="wl-grid wl-ov-top">
        <ActivityPanel rows={w.requests} window={w.window} />
        <TimingPanel rows={w.requests} />
      </div>
      <div className="wl-grid wl-ov-mid">
        <ServicesPanel traces={w.traces} range={w.range} />
        <RecentRequestsPanel rows={w.requests} />
      </div>
      <LatestInsights groups={insights} />
    </>
  );
}
