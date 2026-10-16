import { ExternalLink } from "lucide-react";
import type { RequestRow } from "@wizeworks/lens-core";
import { fmtMs } from "../../format";
import { traceHref } from "../../routes";
import { BarList, type BarItem } from "../../ui/BarList";
import { CopyButton, DotText, toneOfStatus } from "../../ui/Badges";
import { KeyValues } from "../../ui/Panel";
import { statusText } from "./spanInfo";

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

function Summary({ r }: { r: RequestRow }) {
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
        ["User", r.user ?? <span className="wl-muted">Anonymous</span>],
        ["Trace ID", <Copyable text={r.traceId} />],
        ["Request ID", <Copyable text={r.requestId} />],
      ]}
    />
  );
}

const tagClass = (tag: string) => (/:(hit|ok|success|true)$/i.test(tag) ? "wl-chip wl-chip-green" : tag.startsWith("user:") ? "wl-chip" : "wl-chip wl-chip-blue");

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <p className="wl-muted wl-small">No tags. Add them with WizeLensRequest.Tag(…) in .NET or wizelens.tag(…) in Node.</p>;
  return (
    <div className="wl-chips">
      {tags.map((t) => (
        <span key={t} className={tagClass(t)}>{t}</span>
      ))}
    </div>
  );
}

function timingItems(r: RequestRow): BarItem[] {
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
export function PanelOverview({ r }: { r: RequestRow }) {
  return (
    <>
      <h3 className="wl-section-title">Summary</h3>
      <Summary r={r} />
      <h3 className="wl-section-title">Tags</h3>
      <Tags tags={r.tags} />
      <div className="wl-rq-timing-head">
        <h3 className="wl-section-title">Timing Breakdown</h3>
        <strong>{fmtMs(r.durationMs)}</strong>
      </div>
      <BarList items={timingItems(r)} max={r.durationMs} />
      <a className="wl-btn wl-btn-primary-outline wl-rq-full" href={traceHref(r.traceId)}>
        <ExternalLink aria-hidden="true" /> View full trace
      </a>
    </>
  );
}
