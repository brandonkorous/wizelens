import { useMemo } from "react";
import { busyMs, queryText } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { Empty } from "../../ui/Panel";
import { badgesFor, FindingBadges, rowClass, ServiceChip, type TabProps } from "./tabParts";
import { pressable } from "../../ui/pressable";

export function SqlTab(props: TabProps) {
  const { trace, findings, onSelect } = props;
  const spans = trace.spans.filter((s) => s.category === "db");
  const badges = useMemo(() => badgesFor(findings), [findings]);
  const unique = new Set(spans.map(queryText)).size;
  const total = spans.reduce((t, s) => t + s.durationMs, 0);
  const wall = busyMs(spans);
  if (spans.length === 0) return <Empty>No database calls in this request.</Empty>;
  return (
    <>
      <div className="wl-tab-summary">
        <span>
          <strong>{spans.length}</strong> queries
        </span>
        <span>
          <strong>{unique}</strong> unique
        </span>
        <span>
          <strong>{fmtMs(total)}</strong> total
        </span>
        {total - wall >= 1 && (
          <span title="Queries that ran at the same time count once">
            <strong>{fmtMs(wall)}</strong> wall time
          </span>
        )}
      </div>
      <ol className="wl-sql-list">
        {spans.map((s, i) => (
          <li key={s.spanId} className={`wl-sql-item ${rowClass(s, props)}`} {...pressable(() => onSelect(s.spanId))}>
            <div className="wl-sql-meta">
              <span className="wl-muted">#{i + 1}</span>
              <ServiceChip service={s.service} trace={trace} />
              <span className="wl-muted">{String(s.attributes["db.system.name"] ?? "")}</span>
              {s.attributes["wizelens.db.adapter"] != null && <span className="wl-muted">via {String(s.attributes["wizelens.db.adapter"])}</span>}
              <FindingBadges kinds={badges.get(s.spanId)} />
              <span className="wl-spacer" />
              {s.attributes["db.response.returned_rows"] != null && <span className="wl-muted">{String(s.attributes["db.response.returned_rows"])} rows</span>}
              <strong>{fmtMs(s.durationMs)}</strong>
            </div>
            <pre className="wl-code wl-sql">{queryText(s)}</pre>
            {s.attributes["wizelens.db.parameters"] != null && (
              <div className="wl-sql-params wl-mono wl-small">params: {String(s.attributes["wizelens.db.parameters"])}</div>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
