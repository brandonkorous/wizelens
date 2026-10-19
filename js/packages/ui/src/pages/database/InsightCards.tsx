import { ChevronRight, Database, Globe, Monitor, TriangleAlert } from "lucide-react";
import type { InsightGroup } from "@wizeworks/lens-core";
import { hrefTo } from "../../routes";
import { ImpactBadge } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";

const AREA_ICON = { database: Database, http: Globe, render: Monitor };

function InsightCard({ insight }: { insight: InsightGroup }) {
  const Icon = insight.impact === "medium" ? TriangleAlert : AREA_ICON[insight.area];
  return (
    <a className="wl-insight-card" href={hrefTo("insights", [], { key: insight.key })}>
      <span className={`wl-insight-icon wl-impact-${insight.impact}`}>
        <Icon aria-hidden="true" />
      </span>
      <span className="wl-insight-body">
        <span className="wl-insight-title">
          <strong>{insight.title}</strong>
          <ImpactBadge impact={insight.impact} />
        </span>
        <span className="wl-insight-text">{insight.description}</span>
      </span>
      <ChevronRight className="wl-insight-go" aria-hidden="true" />
    </a>
  );
}

/** The top three insights as cards, with a link to all of them. */
export function InsightCards({ insights, area }: { insights: InsightGroup[]; area?: string }) {
  return (
    <Panel title="Latest Insights" action={<ViewAll href={hrefTo("insights", [], { area })} label="View all insights" />}>
      {insights.length === 0 ? (
        <Empty>No problems found in this time range.</Empty>
      ) : (
        <div className="wl-insight-cards">
          {insights.slice(0, 3).map((i) => (
            <InsightCard key={i.key} insight={i} />
          ))}
        </div>
      )}
    </Panel>
  );
}
