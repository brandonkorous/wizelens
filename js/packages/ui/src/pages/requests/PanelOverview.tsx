import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { endpointScope, type RequestItem, serviceScope, userScope } from "@wizeworks/lens-core/internal";
import { fmtMs } from "../../format";
import { traceHref, userHref } from "../../routes";
import { BarList, type BarItem } from "../../ui/BarList";
import { CopyButton, DotText, toneOfStatus } from "../../ui/Badges";
import { KeyValues } from "../../ui/Panel";
import { statusText } from "./spanInfo";
import { traceRow, useRowTags } from "../../data/tagMatch";
import { TagChips } from "../../ui/TagChips";
import { TagThis } from "../../ui/TagThis";

const countMs = (n: number, ms: number) => (n === 0 ? "0" : `${n} (${fmtMs(ms)})`);

function Copyable({ text }: { text: string | null }) {
  if (!text) return <span className="wl-muted">–</span>;
  return (
    <span className="wl-rq-copy">
      <CopyButton text={text} />
      <span className="wl-mono wl-truncate" title={text}>{text}</span>
    </span>
  );
}

function Summary({ r }: { r: RequestItem }) {
  return (
    <KeyValues
      rows={[
        ["Service", r.service],
        ["Method", r.method],
        ["Path", <span className="wl-mono">{r.path}</span>],
        ["Status", <DotText tone={toneOfStatus(r.status)}>{statusText(r.status, r.aborted)}</DotText>],
        ["Duration", fmtMs(r.durationMs)],
        ["SQL Queries", countMs(r.dbCount, r.dbMs)],
        ["Fetch Calls", countMs(r.fetchCount, r.fetchMs)],
        ["User Agent", r.userAgent ?? <span className="wl-muted">Not captured</span>],
        ["IP Address", r.clientAddress ?? <span className="wl-muted">Not captured</span>],
        ["User", r.user ? <a href={userHref(r.user)}>{r.user}</a> : <span className="wl-muted">Anonymous</span>],
        ["Trace ID", <Copyable text={r.traceId} />],
        ["Request ID", <Copyable text={r.requestId} />],
      ]}
    />
  );
}

const tagClass = (tag: string) => (/:(hit|ok|success|true)$/i.test(tag) ? "wl-chip wl-chip-green" : tag.startsWith("user:") ? "wl-chip" : "wl-chip wl-chip-blue");

const requestScopes = (r: RequestItem) => [endpointScope(r.service, r.endpoint), serviceScope(r.service), ...(r.user ? [userScope(r.user)] : [])];

/** Tags from tag rules, then tags the app set on the request, and Tag this. */
function Tags({ r }: { r: RequestItem }) {
  const rows = useMemo(() => [r], [r]);
  const ruleTags = useRowTags("requests", rows, traceRow)(r);
  const none = ruleTags.length === 0 && r.tags.length === 0;
  return (
    <div className="wl-chips wl-rq-tags">
      <TagChips tags={ruleTags} />
      {r.tags.map((t) => (
        <span key={t} className={tagClass(t)}>{t}</span>
      ))}
      {none && <span className="wl-muted wl-small">No tags. Tag this request's endpoint, service, or user, or set tags in code with WizeLensRequest.Tag(…) or wizelens.tag(…).</span>}
      <TagThis scopes={requestScopes(r)} />
    </div>
  );
}

function timingItems(r: RequestItem): BarItem[] {
  const part = (key: string, label: string, ms: number | null, color: string): BarItem => ({ key, label, value: ms ?? 0, display: fmtMs(ms), color });
  return [
    part("total", "Total", r.durationMs, "var(--wl-blue)"),
    part("server", "App (server)", r.serverMs, "color-mix(in srgb, var(--wl-blue) 55%, transparent)"),
    part("db", "Database (SQL)", r.serverMs === null && r.dbCount === 0 ? null : r.dbMs, "color-mix(in srgb, var(--wl-blue) 55%, transparent)"),
    part("fetch", "External Fetch", r.fetchCount ? r.fetchMs : null, "color-mix(in srgb, var(--wl-blue) 55%, transparent)"),
    part("render", "Rendering", r.renderMs, "color-mix(in srgb, var(--wl-blue) 40%, transparent)"),
    part("network", "Network", r.networkMs, "color-mix(in srgb, var(--wl-blue) 30%, transparent)"),
  ];
}

/** Summary, tags, and timing of one request. */
export function PanelOverview({ r }: { r: RequestItem }) {
  return (
    <>
      <h3 className="wl-section-title">Summary</h3>
      <Summary r={r} />
      <h3 className="wl-section-title">Tags</h3>
      <Tags r={r} />
      <div className="wl-rq-timing-head">
        <h3 className="wl-section-title">Timing Breakdown</h3>
        <strong>{fmtMs(r.durationMs)}</strong>
      </div>
      <BarList items={timingItems(r)} max={r.durationMs} />
      {r.renderMs === null && <p className="wl-chart-note">Rendering and Network come from the browser&apos;s page view. None is joined to this request: an API call, a redirect, or a page loaded without the browser add-on. A page view with its own trace shows under Traces.</p>}
      <a className="wl-btn wl-btn-primary-outline wl-rq-full" href={traceHref(r.traceId)}>
        <ExternalLink aria-hidden="true" /> View full trace
      </a>
    </>
  );
}
