import { X } from "lucide-react";
import type { ReactNode } from "react";
import { type IssueInfo, OWASP_CATEGORIES, type SecurityGroup, SECURITY_LABELS, type UsersAffected } from "@wizeworks/lens-core/internal";
import { fmtAgo, fmtCount } from "../../format";
import { hrefTo, setQuery, traceHref, userHref } from "../../routes";
import { Badge, CopyButton, ImpactBadge } from "../../ui/Badges";
import { IssueActions, IssueBadge } from "../../ui/IssueControls";
import { KeyValues, Panel } from "../../ui/Panel";
import { useOpenFocus } from "../../ui/useOpenFocus";
import { SECURITY_ADVICE } from "./advice";

const OWASP_NAME = Object.fromEntries(OWASP_CATEGORIES.map((c) => [c.id, c.name]));

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

function facts(group: SecurityGroup, users: UsersAffected | null, now: number): [string, ReactNode][] {
  const rows: [string, ReactNode][] = [
    ["Seen in", `${fmtCount(group.occurrences)} ${group.kind === "auth-guessing" ? "failed sign-ins" : "requests"}`],
    ["Found", `${fmtCount(group.count)} times`],
    ["First seen", fmtAgo(group.firstSeenMs, now)],
  ];
  if (group.addresses !== null) rows.push(["Addresses", fmtCount(group.addresses)]);
  if (users) rows.push(["Users affected", <UsersLine key="u" users={users} />]);
  return rows;
}

/** Endpoints, or for a package the services that run it. */
function Endpoints({ group }: { group: SecurityGroup }) {
  if (!group.endpoints.length) return <p className="wl-muted">None recorded.</p>;
  const href = (e: string) => (group.kind === "vulnerable-package" ? hrefTo("services", [encodeURIComponent(e)]) : hrefTo("requests", [], { endpoint: e }));
  return (
    <ul className="wl-insight-endpoints">
      {group.endpoints.map((e) => (
        <li key={e}>
          <a className="wl-mono" href={href(e)}>{e}</a>
        </li>
      ))}
    </ul>
  );
}

/** A package's advisories, each with its fixed versions and a link to OSV. */
function Advisories({ group }: { group: SecurityGroup }) {
  if (!group.advisories?.length) return null;
  return (
    <>
      <div className="wl-section-title">Advisories</div>
      <ul className="wl-insight-endpoints">
        {group.advisories.map((a) => (
          <li key={a.id}>
            <a href={a.url} target="_blank" rel="noreferrer" className="wl-mono">{a.id}</a> {a.aliases.filter((x) => x.startsWith("CVE-")).join(", ")}
            <div className="wl-muted wl-small">{a.summary}{a.fixed.length ? ` Fixed in ${a.fixed.join(", ")}.` : ""}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function SecurityDetail({ group, info, users, now }: { group: SecurityGroup; info: IssueInfo | undefined; users: UsersAffected | null; now: number }) {
  const advice = SECURITY_ADVICE[group.kind];
  const title = useOpenFocus<HTMLHeadingElement>(group.key);
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
        <Badge tone="neutral">{`${group.owasp} ${OWASP_NAME[group.owasp] ?? ""}`}</Badge>
        <Badge tone="neutral">{SECURITY_LABELS[group.kind]}</Badge>
        <IssueBadge kind="insight" info={info} />
        <span>Last seen {fmtAgo(group.lastSeenMs, now)}</span>
      </div>
      <IssueActions kind="insight" issueKey={group.key} info={info} />
      <p className="wl-insight-desc">{group.description}</p>
      <div className="wl-section-title">
        Evidence <CopyButton text={group.shape} label="Copy evidence" />
      </div>
      <pre className="wl-code wl-insight-shape">{group.shape}</pre>
      <KeyValues rows={facts(group, users, now)} />
      <div className="wl-section-title">Why it matters</div>
      <p className="wl-insight-desc">{advice.why}</p>
      <div className="wl-section-title">How to fix it</div>
      <ol className="wl-insight-fix">
        {advice.fix.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ol>
      <Advisories group={group} />
      <div className="wl-section-title">{group.kind === "vulnerable-package" ? "Services" : "Affected endpoints"}</div>
      <Endpoints group={group} />
      {group.exampleTraceId && <p className="wl-muted wl-small">WizeLens found this in real traffic. It is a strong hint, not proof: check the example trace.</p>}
      {group.exampleTraceId && (
        <a className="wl-btn wl-btn-primary-outline" href={traceHref(group.exampleTraceId, "security")}>
          View example trace
        </a>
      )}
    </Panel>
  );
}
