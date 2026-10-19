import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Database, Monitor, Server } from "lucide-react";
import type { ErrorGroup } from "@wizeworks/lens-core";
import { fmtCount, fmtDateTime } from "../../format";
import { hrefTo, setQuery } from "../../routes";
import { Badge } from "../../ui/Badges";
import { Empty, KeyValues, Panel, TabBar } from "../../ui/Panel";
import { ErrorTags, RequestContext, StackTrace } from "./ErrorDetailTabs";

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

function GroupDetails({ group }: { group: ErrorGroup }) {
  const [tab, setTab] = useState<Tab>("stack");
  return (
    <>
      <div className="wl-side-head">
        <h2 className="wl-err-title">
          {group.type}: {group.message}
        </h2>
        <Badge tone="danger">{group.critical ? "Critical" : "Error"}</Badge>
      </div>
      <Occurrences group={group} />
      <KeyValues
        rows={[
          ["Endpoint", <span key="e" className="wl-mono">{pathOf(group.endpoint)}</span>],
          ["Service", group.service],
          ["First seen", fmtDateTime(group.firstSeenMs)],
          ["Last seen", fmtDateTime(group.lastSeenMs)],
        ]}
      />
      <div className="wl-err-tabs">
        <TabBar<Tab> tabs={[["stack", "Stack Trace"], ["context", "Request Context"], ["tags", "Tags"]]} value={tab} onChange={setTab} />
        {tab === "stack" && <StackTrace event={group.latest} />}
        {tab === "context" && <RequestContext event={group.latest} />}
        {tab === "tags" && <ErrorTags event={group.latest} />}
      </div>
    </>
  );
}

/** The chosen group, or a note when a linked group is not in this range. The pager steps through the listed groups. */
export function ErrorDetailsPanel({ groups, group, linked }: { groups: ErrorGroup[]; group: ErrorGroup | null; linked: boolean }) {
  const index = group ? groups.findIndex((g) => g.key === group.key) : -1;
  const empty = linked ? (
    <Empty title="This error is not in the selected time range">Pick a longer time range at the top, or pick another exception.</Empty>
  ) : (
    <Empty title="No error selected">Pick an exception to see its details.</Empty>
  );
  return (
    <Panel title="Error Details" action={index >= 0 && groups.length > 1 && <Pager groups={groups} index={index} />} className="wl-err-details">
      {group ? <GroupDetails key={group.key} group={group} /> : empty}
    </Panel>
  );
}
