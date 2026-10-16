import type { InsightGroup } from "@wizeworks/lens-core";
import { fmtAgo, fmtCount, fmtMs } from "../../format";
import { setQuery } from "../../routes";
import { ImpactBadge } from "../../ui/Badges";
import { Empty } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";
import { AREA_LABEL } from "./advice";

const RANK = { high: 3, medium: 2, low: 1 } as const;

function columns(now: number, compact: boolean): Column<InsightGroup>[] {
  const all: (Column<InsightGroup> | false)[] = [
    { key: "impact", header: "Impact", cell: (g) => <ImpactBadge impact={g.impact} />, sort: (g) => RANK[g.impact] },
    {
      key: "title",
      header: "Insight",
      cell: (g) => (
        <div className="wl-insight-cell">
          <strong>{g.title}</strong>
          <span className="wl-muted wl-small">{g.description}</span>
          <code className="wl-mono wl-small wl-truncate">{g.shape}</code>
        </div>
      ),
      sort: (g) => g.title,
    },
    !compact && { key: "area", header: "Area", cell: (g) => AREA_LABEL[g.area], sort: (g) => g.area },
    { key: "seen", header: "Seen in", num: true, cell: (g) => fmtCount(g.occurrences), sort: (g) => g.occurrences },
    !compact && { key: "time", header: "Time", num: true, cell: (g) => fmtMs(g.totalMs), sort: (g) => g.totalMs },
    !compact && { key: "endpoints", header: "Endpoints", cell: (g) => <span className="wl-mono wl-small">{g.endpoints[0] ?? "–"}{g.endpoints.length > 1 ? ` +${g.endpoints.length - 1}` : ""}</span> },
    { key: "last", header: "Last seen", cell: (g) => <span className="wl-nowrap">{fmtAgo(g.lastSeenMs, now)}</span>, sort: (g) => g.lastSeenMs },
  ];
  return all.filter((c): c is Column<InsightGroup> => !!c);
}

export function InsightList({ groups, selected, now, filtered }: { groups: InsightGroup[]; selected: string | null; now: number; filtered: boolean }) {
  const empty = filtered ? (
    <Empty title="No insights match these filters" />
  ) : (
    <Empty title="No insights in this range">WizeLens checks every request for N+1 queries, repeated queries, slow queries, chatty HTTP calls, and render problems.</Empty>
  );
  return (
    <Table
      columns={columns(now, selected !== null)}
      rows={groups}
      rowKey={(g) => g.key}
      selectedKey={selected}
      onRowClick={(g) => setQuery({ key: g.key === selected ? null : g.key })}
      empty={empty}
    />
  );
}
