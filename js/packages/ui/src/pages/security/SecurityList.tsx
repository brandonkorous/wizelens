import { type IssueInfo, type PageInfo, type SecurityGroup, SECURITY_LABELS } from "@wizeworks/lens-core";
import { fmtAgo, fmtCount } from "../../format";
import { setQuery } from "../../routes";
import { Badge, ImpactBadge } from "../../ui/Badges";
import { useIssueBulk } from "../../ui/IssueBulk";
import { IssueBadge } from "../../ui/IssueControls";
import { Empty } from "../../ui/Panel";
import { type Column, Table } from "../../ui/Table";

const RANK = { high: 3, medium: 2, low: 1 } as const;

function columns(now: number, compact: boolean, issues: Record<string, IssueInfo>): Column<SecurityGroup>[] {
  const all: (Column<SecurityGroup> | false)[] = [
    { key: "impact", header: "Severity", cell: (g) => <ImpactBadge impact={g.impact} />, sort: (g) => RANK[g.impact] },
    {
      key: "title",
      header: "Risk",
      cardTitle: true,
      cell: (g) => (
        <div className="wl-insight-cell">
          <strong>
            {g.title} <IssueBadge kind="insight" info={issues[g.key]} />
          </strong>
          <span className="wl-muted wl-small">{g.description}</span>
          <code className="wl-mono wl-small wl-truncate">{g.shape}</code>
        </div>
      ),
      sort: (g) => g.title,
    },
    { key: "owasp", header: "OWASP", cell: (g) => <span className="wl-owasp" title={SECURITY_LABELS[g.kind]}>{g.owasp}</span>, sort: (g) => g.owasp },
    !compact && { key: "kind", header: "Rule", cell: (g) => <Badge tone="neutral">{SECURITY_LABELS[g.kind]}</Badge>, sort: (g) => g.kind },
    { key: "seen", header: "Seen in", num: true, cell: (g) => fmtCount(g.occurrences), sort: (g) => g.occurrences },
    !compact && { key: "endpoints", header: "Endpoints", cell: (g) => <span className="wl-mono wl-small">{g.endpoints[0] ?? "–"}{g.endpoints.length > 1 ? ` +${g.endpoints.length - 1}` : ""}</span> },
    { key: "last", header: "Last seen", cell: (g) => <span className="wl-nowrap">{fmtAgo(g.lastSeenMs, now)}</span>, sort: (g) => g.lastSeenMs },
  ];
  return all.filter((c): c is Column<SecurityGroup> => !!c);
}

export interface SecurityListProps {
  groups: SecurityGroup[];
  issues: Record<string, IssueInfo>;
  selected: string | null;
  now: number;
  filtered: boolean;
  paging: PageInfo;
}

export function SecurityList({ groups, issues, selected, now, filtered, paging }: SecurityListProps) {
  const empty = filtered ? (
    <Empty title="No risks match these filters" />
  ) : (
    <Empty title="No security risks in this range">WizeLens checks every request for SQL built from input, missing security headers, loose CORS, cookies without flags, secrets in URLs and logs, plain HTTP calls, open admin routes, and stack traces in answers.</Empty>
  );
  const bulk = useIssueBulk("insight", groups.map((g) => g.key), "risk");
  return (
    <>
      {bulk.bar}
      <Table
        columns={columns(now, selected !== null, issues)}
        rows={groups}
        served={{ info: paging, noun: "risks" }}
        rowKey={(g) => g.key}
        selectedKey={selected}
        onRowClick={(g) => setQuery({ key: g.key === selected ? null : g.key })}
        empty={empty}
        select={bulk.select}
      />
    </>
  );
}
