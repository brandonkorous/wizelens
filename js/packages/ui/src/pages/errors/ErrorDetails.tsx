import { type ReactNode, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Database, ExternalLink, Monitor, Server } from "lucide-react";
import { endpointScope, type ErrorGroup, errorGroupDoc, errorGroupLabel, errorScope, errorText, isDevServer, isNoise, type IssueInfo, serviceScope } from "@wizeworks/lens-core/internal";
import { fmtCount, fmtDateTime } from "../../format";
import { errorHref, hrefTo, setQuery } from "../../routes";
import { Badge } from "../../ui/Badges";
import { breakable } from "../../ui/breakable";
import { IssueActions, IssueBadge } from "../../ui/IssueControls";
import { Empty, KeyValues, Panel, TabBar } from "../../ui/Panel";
import { ErrorTags, RequestContext } from "./ErrorDetailTabs";
import { ErrorStack } from "./ResolvedStack";
import { useGroupTags } from "../../data/tagMatch";
import { TagChips } from "../../ui/TagChips";
import { TagThis } from "../../ui/TagThis";
import { useOpenFocus } from "../../ui/useOpenFocus";

type Tab = "stack" | "context" | "tags";

const pathOf = (endpoint: string) => endpoint.replace(/^[A-Z]+ /, "");

function Pager({ groups, index }: { groups: ErrorGroup[]; index: number }) {
  const go = (i: number) => setQuery({ group: groups[i]?.key });
  return (
    <div className="wl-err-nav">
      <button type="button" aria-label="Previous error" disabled={index <= 0} onClick={() => go(index - 1)}>
        <ChevronLeft size={16} />
      </button>
      <button type="button" aria-label="Next error" disabled={index >= groups.length - 1} onClick={() => go(index + 1)}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/** Failed requests of the error's endpoint; browser errors (no request) search the route instead. */
const affectedHref = (g: ErrorGroup) =>
  g.latest.method ? hrefTo("requests", [], { endpoint: g.endpoint, status: "failed" }) : hrefTo("requests", [], { q: pathOf(g.endpoint), status: "failed" });

function Occurrences({ group }: { group: ErrorGroup }) {
  const Icon = group.latest.browser ? Monitor : group.type.toLowerCase().includes("db") || group.type.toLowerCase().includes("sql") ? Database : Server;
  return (
    <div className="wl-err-occ">
      <span className="wl-cell-icon">
        <Icon aria-hidden="true" />
        {fmtCount(group.count)} occurrence{group.count === 1 ? "" : "s"}
      </span>
      <a className="wl-view-all" href={affectedHref(group)}>
        View affected requests <ArrowRight aria-hidden="true" />
      </a>
    </div>
  );
}

// Browser errors: where in the original source they come from, and the release that threw them.
function originRows(group: ErrorGroup): [string, ReactNode][] {
  const e = group.latest;
  return [
    ...(e.frame ? [["Source", <span key="f" className="wl-mono">{e.frame}</span>] as [string, ReactNode]] : []),
    ...(e.release ? [["Release", e.release] as [string, ReactNode]] : []),
  ];
}
/** "Tag this" on an error: the error itself, its endpoint (for server errors), or its service. */
export const errorScopes = (g: ErrorGroup) => [errorScope(g), ...(g.latest.method ? [endpointScope(g.service, g.endpoint)] : []), serviceScope(g.service)];

function GroupDetails({ group, info }: { group: ErrorGroup; info: IssueInfo | undefined }) {
  const [tab, setTab] = useState<Tab>("stack");
  const tags = useGroupTags()("errors", errorGroupDoc(group));
  const title = useOpenFocus<HTMLHeadingElement>(group.key);
  return (
    <>
      <div className="wl-side-head">
        <h2 ref={title} tabIndex={-1} className="wl-err-title">
          {errorText(group) === group.message ? group.message : <>{breakable(group.type)}: {group.message}</>}
        </h2>
        <Badge tone={isNoise(group) ? "neutral" : "danger"}>{errorGroupLabel(group)}</Badge>
        <IssueBadge info={info} />
      </div>
      {isDevServer(group) && <p className="wl-muted wl-small">From the dev server rebuilding or restarting (its own build files), not from your app's code.</p>}
      <div className="wl-err-tagline">
        <TagChips tags={tags} />
        <TagThis scopes={errorScopes(group)} />
      </div>
      <IssueActions kind="error" issueKey={group.key} info={info} />
      <a className="wl-btn wl-btn-primary-outline wl-err-full" href={errorHref(group.key)}>
        <ExternalLink aria-hidden="true" /> View full error
      </a>
      <Occurrences group={group} />
      <KeyValues
        rows={[
          ["Endpoint", <span key="e" className="wl-mono">{pathOf(group.endpoint)}</span>],
          ["Service", group.service],
          ...originRows(group),
          ["First seen", fmtDateTime(info?.firstSeenMs || group.firstSeenMs)],
          ["Last seen", fmtDateTime(group.lastSeenMs)],
        ]}
      />
      <div className="wl-err-tabs">
        <TabBar<Tab> tabs={[["stack", "Stack Trace"], ["context", "Request Context"], ["tags", "Tags"]]} value={tab} onChange={setTab} />
        {tab === "stack" && <ErrorStack event={group.latest} />}
        {tab === "context" && <RequestContext event={group.latest} />}
        {tab === "tags" && <ErrorTags event={group.latest} />}
      </div>
    </>
  );
}

/** The chosen group, or a note when a linked group is not in this range (never while it is still loading). The pager steps through the listed groups. */
export function ErrorDetailsPanel({ groups, group, linked, loading, issues }: { groups: ErrorGroup[]; group: ErrorGroup | null; linked: boolean; loading: boolean; issues: Record<string, IssueInfo> }) {
  const index = group ? groups.findIndex((g) => g.key === group.key) : -1;
  const empty = linked && loading ? (
    <Empty title="Loading this error…" />
  ) : linked ? (
    <Empty title="This error is not in the selected time range">Pick a longer time range at the top, or pick another exception.</Empty>
  ) : (
    <Empty title="No error selected">Pick an exception to see its details.</Empty>
  );
  return (
    <Panel title="Error Details" action={index >= 0 && groups.length > 1 && <Pager groups={groups} index={index} />} className="wl-err-details">
      {group ? <GroupDetails key={group.key} group={group} info={issues[group.key]} /> : empty}
    </Panel>
  );
}
