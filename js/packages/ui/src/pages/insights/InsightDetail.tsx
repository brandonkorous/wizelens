import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { InsightGroup, IssueInfo, UsersAffected } from "@wizeworks/lens-core/internal";
import { fmtAgo, fmtCount, fmtMs } from "../../format";
import { hrefTo, setQuery, traceHref, userHref } from "../../routes";
import { Badge, CopyButton, ImpactBadge } from "../../ui/Badges";
import { IssueActions, IssueBadge } from "../../ui/IssueControls";
import { KeyValues, Panel } from "../../ui/Panel";
import { useOpenFocus } from "../../ui/useOpenFocus";
import { adviceFor, AREA_LABEL } from "./advice";

/** The requests of an endpoint that had insights, or the route on the Rendering page. */
function endpointHref(g: InsightGroup, endpoint: string): string {
  if (g.area === "render") return hrefTo("rendering", [], { q: endpoint });
  return hrefTo("requests", [], { endpoint, insights: "1" });
}

function Endpoints({ group }: { group: InsightGroup }) {
  return (
    <ul className="wl-insight-endpoints">
      {group.endpoints.map((e) => (
        <li key={e}>
          <a className="wl-mono" href={endpointHref(group, e)}>
            {e}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** "3: user-9, user-1, user-4" with links to each user's page. */
function UsersLine({ users }: { users: UsersAffected }) {
  if (!users.count) return <>0</>;
  return (
    <span>
      {fmtCount(users.count)}:{" "}
      {users.top.slice(0, 3).map((u, i) => (
        <span key={u.user}>{i > 0 && ", "}<a href={userHref(u.user)}>{u.user}</a></span>
      ))}
    </span>
  );
}

export function InsightDetail({ group, info, users, now }: { group: InsightGroup; info: IssueInfo | undefined; users: UsersAffected | null; now: number }) {
  const advice = adviceFor(group);
  const title = useOpenFocus<HTMLHeadingElement>(group.key);
  const example = group.area === "render" ? traceHref(group.exampleTraceId) : traceHref(group.exampleTraceId, "insights");
  return (
    <Panel className="wl-insight-detail">
      <div className="wl-side-head">
        <h2 ref={title} tabIndex={-1}>{group.title}</h2>
        <button type="button" className="wl-icon-btn" onClick={() => setQuery({ key: null })} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      <div className="wl-side-meta">
        <ImpactBadge impact={group.impact} />
        <Badge tone="neutral">{AREA_LABEL[group.area]}</Badge>
        <IssueBadge kind="insight" info={info} />
        <span>Last seen {fmtAgo(group.lastSeenMs, now)}</span>
      </div>
      <IssueActions kind="insight" issueKey={group.key} info={info} />
      <p className="wl-insight-desc">{group.description}</p>
      <div className="wl-section-title">
        Pattern <CopyButton text={group.shape} label="Copy pattern" />
      </div>
      <pre className="wl-code wl-insight-shape">{group.shape}</pre>
      <KeyValues rows={[["Seen in", `${fmtCount(group.occurrences)} ${group.area === "render" ? (group.key.includes("|component|") ? "renders" : "page views") : "requests"}`], ["Repeats", fmtCount(group.count)], ["Time involved", fmtMs(group.totalMs)], ...(users ? [["Users affected", <UsersLine key="u" users={users} />] as [string, ReactNode]] : [])]} />
      <div className="wl-section-title">Why it matters</div>
      <p className="wl-insight-desc">{advice.why}</p>
      <div className="wl-section-title">How to fix it</div>
      <ol className="wl-insight-fix">
        {advice.fix.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ol>
      <div className="wl-section-title">{group.area === "render" ? "Routes" : "Affected endpoints"}</div>
      {group.endpoints.length ? <Endpoints group={group} /> : <p className="wl-muted">None recorded.</p>}
      <a className="wl-btn wl-btn-primary-outline" href={example}>
        View example trace
      </a>
    </Panel>
  );
}
