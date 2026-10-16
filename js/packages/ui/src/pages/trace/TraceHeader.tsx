import { ArrowLeft, RefreshCw } from "lucide-react";
import { type Health, type Timing, timingSegments, type Trace } from "@wizeworks/lens-core";
import { fmtClock, fmtMs } from "../../format";
import { hrefTo } from "../../routes";
import { CopyButton } from "../../ui/Badges";
import { ServiceChip } from "./tabParts";

const pillClass = (code: number) => (code >= 500 ? "wl-pill-err" : code >= 400 ? "wl-pill-warn" : "wl-pill-ok");

function Stats({ trace, timing }: { trace: Trace; timing: Timing }) {
  const items: [string, string][] = [
    ["Total", fmtMs(timing.totalMs)],
    ["Server", fmtMs(timing.serverMs)],
    ["Database", fmtMs(timing.dbMs)],
    ["Render", fmtMs(timing.renderMs)],
    ["Started", fmtClock(trace.startMs)],
    ["Spans", String(trace.spanCount)],
    ["Queries", String(trace.dbCount)],
    ["HTTP calls", String(trace.httpClientCount)],
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
            <ServiceChip key={s} service={s} services={trace.services} />
          ))}
        </dd>
      </div>
    </dl>
  );
}

function SplitBar({ timing, failed }: { timing: Timing; failed: boolean }) {
  const seg = timingSegments(timing);
  const share = (ms: number) => `${(ms / Math.max(timing.totalMs, 0.001)) * 100}%`;
  const parts: [string, string, number][] = [
    [failed ? "wl-c-error" : "wl-c-server", "Server code", seg.server],
    ["wl-c-db", "Database", seg.db],
    ["wl-c-render", "Render", seg.render],
    ["wl-c-other", "Network and other", seg.other],
  ];
  return (
    <>
      <div className="wl-split-bar" aria-hidden="true">
        {parts.map(([cls, , ms]) => (
          <i key={cls} className={cls} style={{ width: share(ms) }} />
        ))}
      </div>
      <div className="wl-legend">
        {parts.map(([cls, label, ms]) => (
          <span key={label}>
            <i className={cls} /> {label} <b>{fmtMs(ms)}</b>
          </span>
        ))}
      </div>
    </>
  );
}

export interface TraceHeaderProps {
  trace: Trace;
  timing: Timing;
  health: Health;
  loading: boolean;
  onRefresh: () => void;
}

export function TraceHeader({ trace, timing, health, loading, onRefresh }: TraceHeaderProps) {
  const code = trace.rootStatusCode;
  return (
    <section className="wl-panel wl-trace-head">
      <a className="wl-back" href={hrefTo("traces", [], { trace: trace.traceId })}>
        <ArrowLeft size={14} aria-hidden="true" /> All traces
      </a>
      <div className="wl-trace-title">
        <h1>
          <span className={`wl-h-dot wl-h-${health}`} title={`Health: ${health}`} />
          {trace.rootName}
          {code != null && <span className={`wl-pill wl-small-chip ${pillClass(code)}`}>{code}</span>}
        </h1>
        <button type="button" className="wl-btn" onClick={onRefresh} disabled={loading}>
          <RefreshCw aria-hidden="true" /> {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <Stats trace={trace} timing={timing} />
      <SplitBar timing={timing} failed={health === "critical"} />
      <div className="wl-muted wl-small wl-mono">
        <CopyButton text={trace.traceId} label="Copy trace id" />
        trace {trace.traceId}
      </div>
    </section>
  );
}
