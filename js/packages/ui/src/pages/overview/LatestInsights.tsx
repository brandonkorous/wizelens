import { ChevronRight, Database, Monitor, TriangleAlert } from "lucide-react";
import type { InsightArea, InsightGroup } from "@wizeworks/lens-core/internal";
import { hrefTo } from "../../routes";
import { ImpactBadge } from "../../ui/Badges";
import { Empty, Panel, ViewAll } from "../../ui/Panel";

const AREA_ICON: Record<InsightArea, typeof Database> = { database: Database, http: TriangleAlert, render: Monitor };
const MAX_CARDS = 3;

function InsightCard({ group }: { group: InsightGroup }) {
  const Icon = AREA_ICON[group.area];
  return (
    <a className="wl-ov-insight" href={hrefTo("insights", [], { key: group.key })}>
      <span className={`wl-ov-insight-icon wl-ov-area-${group.area}`}>
        <Icon aria-hidden="true" />
      </span>
      <span className="wl-ov-insight-body">
        <span className="wl-ov-insight-head">
          <strong className="wl-truncate">{group.title}</strong>
          <ImpactBadge impact={group.impact} />
        </span>
        <span className="wl-ov-insight-text">{group.description}</span>
      </span>
      <ChevronRight className="wl-ov-insight-go" aria-hidden="true" />
    </a>
  );
}

/** The three most important insights in the range. */
export function LatestInsights({ groups }: { groups: readonly InsightGroup[] }) {
  return (
    <Panel title="Latest Insights" action={<ViewAll href={hrefTo("insights")} label="View all insights" />}>
      {groups.length === 0 ? (
        <Empty title="No insights in this range">No N+1 queries, repeated queries, slow queries, or render problems found.</Empty>
      ) : (
        <div className="wl-ov-insights">
          {groups.slice(0, MAX_CARDS).map((g) => (
            <InsightCard key={g.key} group={g} />
          ))}
        </div>
      )}
    </Panel>
  );
}
