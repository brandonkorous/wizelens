import type { ReactNode } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { type Health, type Timing, timingSegments, type Trace } from "@wizeworks/lens-core/internal";
import { fmtClock, fmtDate, fmtMs } from "../../format";
import { CopyButton } from "../../ui/Badges";
import { type Part, pageParts } from "./pageSplit";
import { ServiceChip } from "./tabParts";

const pillClass = (code: number) => (code >= 500 ? "wl-pill-err" : code >= 400 ? "wl-pill-warn" : "wl-pill-ok");

/** All queries, and the part that ran after the response, which the bar below leaves out. */
function dbFact(timing: Timing): ReactNode {
  const after = timing.serverMs === null ? 0 : timing.dbMs - timing.dbInMs;
  if (after < 0.05) return fmtMs(timing.dbMs);
  return <>{fmtMs(timing.dbMs)}<br /><span className="wl-muted wl-small">{fmtMs(after)} after the response</span></>;
}

function Stats({ trace, timing }: { trace: Trace; timing: Timing }) {
  const items: [string, ReactNode][] = [
    ["Total", fmtMs(timing.totalMs)],
    ["Server", fmtMs(timing.serverMs)],
    ["Database", dbFact(timing)],
    ["Render", fmtMs(timing.renderMs)],
    ["Started", <>{fmtClock(trace.startMs)}<br /><span className="wl-muted wl-small">{fmtDate(trace.startMs)}</span></>],
    ["Spans", String(trace.spanCount)],
    ["Queries", String(trace.dbCount)],
    ["HTTP calls out", String(trace.httpClientCount)],
  ];
  return (
    <dl className="wl-stats">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      <div>
        <dt>Services</dt>
        <dd className="wl-chips">
          {trace.services.map((s) => (
            <ServiceChip key={s} service={s} trace={trace} />
          ))}
        </dd>
      </div>
    </dl>
  );
}

/** Server, database, render and the rest; for a page load with no server of yours, the browser's own split. */
function SplitBar({ trace, timing, failed }: { trace: Trace; timing: Timing; failed: boolean }) {
  const seg = timingSegments(timing);
  const share = (ms: number) => `${(ms / Math.max(timing.totalMs, 0.001)) * 100}%`;
  const page = timing.serverMs === null ? pageParts(trace, timing.totalMs) : null;
  const parts: Part[] = page?.parts ?? [
    [failed ? "wl-c-error" : "wl-c-server", "Server code", seg.server],
    ["wl-c-db", "Database", seg.db],
    ["wl-c-render", "Render", seg.render],
    ["wl-c-other", "Network and other", seg.other],
  ];
  return (
    <>
      <div className="wl-split-bar" aria-hidden="true">
        {parts.map(([cls, label, ms]) => (
          <i key={label} className={cls} style={{ width: share(ms) }} />
        ))}
      </div>
      <div className="wl-legend">
        {parts.map(([cls, label, ms]) => (
          <span key={label}>
            <i className={cls} /> {label} <b>{fmtMs(ms)}</b>
          </span>
        ))}
      </div>
      {page && <p className="wl-muted wl-small">{page.note}</p>}
    </>
  );
}

export interface TraceHeaderProps {
  trace: Trace;
  timing: Timing;
  health: Health;
  loading: boolean;
  onRefresh?: () => void;
  /** "All traces" link, or null to hide it. */
  backHref: string | null;
  /** Extra buttons next to Refresh, for example Share. */
  actions?: ReactNode;
  /** The trace's tags, under the title. */
  tags?: ReactNode;
}

export function TraceHeader({ trace, timing, health, loading, onRefresh, backHref, actions, tags }: TraceHeaderProps) {
  const code = trace.rootStatusCode;
  return (
    <section className="wl-panel wl-trace-head">
      {backHref && (
        <a className="wl-back" href={backHref}>
          <ArrowLeft size={14} aria-hidden="true" /> All traces
        </a>
      )}
      <div className="wl-trace-title">
        <h1>
          <span className={`wl-h-dot wl-h-${health}`} title={`Health: ${health}`} />
          {trace.rootName}
          {code != null && <span className={`wl-pill wl-small-chip ${pillClass(code)}`}>{code}</span>}
        </h1>
        <span className="wl-trace-actions">
          {actions}
          {onRefresh && (
            <button type="button" className="wl-btn" onClick={onRefresh} disabled={loading}>
              <RefreshCw aria-hidden="true" /> {loading ? "Refreshing…" : "Refresh"}
            </button>
          )}
        </span>
      </div>
      {tags}
      <Stats trace={trace} timing={timing} />
      <SplitBar trace={trace} timing={timing} failed={health === "critical"} />
      <div className="wl-muted wl-small wl-mono">
        <CopyButton text={trace.traceId} label="Copy trace id" />
        trace {trace.traceId}
      </div>
    </section>
  );
}
