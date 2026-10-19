import { type ReactNode, useId } from "react";
import type { TraceView } from "@wizeworks/lens-core";
import { fmtMs, plural, type RecordedRequest, type RequestView } from "@wizeworks/lens-browser";
import { IconBolt, IconChevron, IconGear, IconMinimize } from "./icons.js";
import { type Panel, StackBar, statusPill } from "./panel-parts.js";
import { DbTip, RenderTip, ServerTip, TotalTip } from "./tips.js";

export interface CardProps {
  req: RecordedRequest | null;
  view: RequestView;
  busy: boolean;
  live: boolean;
  panel: Panel | "";
  /** Dashboard link for one part of this request's trace. Null when the server has no trace for it. */
  link: (view?: TraceView) => string | null;
  onDetails: () => void;
  onToggle: (p: Panel) => void;
  onToggleLive: () => void;
  onMinimize: () => void;
}

/** A footer count. It opens that part of the trace in the dashboard, in a new tab. */
function Count({ href, title, children }: { href: string | null; title: string; children: ReactNode }) {
  if (!href) {
    return (
      <span className="wl-count" title={title}>
        {children}
      </span>
    );
  }
  return (
    <a className="wl-count" href={href} target="_blank" rel="noreferrer" title={`${title}. Opens the dashboard in a new tab.`}>
      {children}
    </a>
  );
}

interface MetricProps {
  label: string;
  value: number | null;
  valueClass?: string;
  tip: ReactNode;
  onClick: () => void;
}

function Metric({ label, value, valueClass = "", tip, onClick }: MetricProps) {
  const tipId = useId();
  return (
    <div className="wl-cell">
      <button type="button" className="wl-metric" onClick={onClick} aria-describedby={tip ? tipId : undefined}>
        <span className={`wl-val ${value === null ? "" : valueClass}`}>{fmtMs(value)}</span>
        <span className="wl-lbl">{label}</span>
      </button>
      {tip && (
        <div className="wl-tip" id={tipId} role="tooltip">
          <div className="wl-tip-body">{tip}</div>
        </div>
      )}
    </div>
  );
}

function CardHead({ req, view, busy, panel, onToggle }: CardProps) {
  const open = panel === "details";
  const pill = statusPill(req, view);
  return (
    <div className="wl-head">
      <span className={`wl-dot${busy ? " wl-busy" : ""}`} title={`Health: ${view.health}`} />
      <span className="wl-brand">WizeLens</span>
      <span className="wl-req" title={req?.url}>
        {req ? `${req.method} ${req.path}` : "—"}
      </span>
      <span className={`wl-pill ${pill.cls}`}>{pill.text}</span>
      <button
        type="button"
        className={`wl-iconbtn wl-chev${open ? " wl-open" : ""}`}
        onClick={() => onToggle("details")}
        aria-expanded={open}
        title={open ? "Hide the details" : "Show the details"}
      >
        <IconChevron />
      </button>
    </div>
  );
}

function CardMetrics({ req, view, link, onDetails }: CardProps) {
  return (
    <div className="wl-metrics">
      <Metric label="Total" value={view.totalMs} onClick={onDetails} tip={req && <TotalTip view={view} href={link("timeline")} />} />
      <Metric label="Server" value={view.serverMs} onClick={onDetails} tip={req && <ServerTip req={req} view={view} href={link("http")} />} />
      <Metric label="Database" value={view.dbMs} valueClass="wl-v-db" onClick={onDetails} tip={req && <DbTip req={req} view={view} href={link("sql")} />} />
      <Metric label="Render" value={view.renderMs} onClick={onDetails} tip={req && <RenderTip view={view} href={link("timeline")} />} />
    </div>
  );
}

function IssueLabel({ req, view }: Pick<CardProps, "req" | "view">) {
  if (!req) return <>No Data</>;
  if (view.errors > 0) {
    return (
      <>
        {plural(view.errors, "Error")} <span className="wl-dot wl-dot-sm wl-h-critical" />
      </>
    );
  }
  if (view.insights === null) return <>— Insights</>;
  const flag = view.insights > 0 && (view.health === "warning" || view.health === "opportunity");
  return (
    <>
      {plural(view.insights, "Insight")}
      {flag && <span className="wl-dot wl-dot-sm" />}
    </>
  );
}

function CardButtons({ live, panel, onToggle, onToggleLive, onMinimize }: CardProps) {
  const liveTitle = live ? "Live: shows the newest request. Click to pin this one." : "Paused on this request. Click to follow the newest.";
  return (
    <>
      <button type="button" className={`wl-iconbtn${live ? " wl-on" : ""}`} onClick={onToggleLive} aria-pressed={live} title={liveTitle}>
        <IconBolt />
      </button>
      <button
        type="button"
        className={`wl-iconbtn${panel === "settings" ? " wl-on" : ""}`}
        onClick={() => onToggle("settings")}
        aria-expanded={panel === "settings"}
        title="Settings"
      >
        <IconGear />
      </button>
      <button type="button" className="wl-iconbtn" onClick={onMinimize} title="Minimize WizeLens">
        <IconMinimize />
      </button>
    </>
  );
}

function CardFoot(props: CardProps) {
  const { req, view, link } = props;
  return (
    <div className="wl-foot">
      <Count href={link("sql")} title="Database queries in this request">
        {view.sql ?? (req ? "—" : 0)} SQL
      </Count>
      <Count href={link("http")} title="HTTP calls this request made to other services">
        {view.fetch ?? (req ? "—" : 0)} Fetch
      </Count>
      <Count href={link(view.errors > 0 ? "errors" : "insights")} title="Errors and hints: N+1, duplicate, and slow queries">
        <IssueLabel req={req} view={view} />
      </Count>
      <span className="wl-spacer" />
      <CardButtons {...props} />
    </div>
  );
}

export function Card(props: CardProps) {
  const failed = props.view.health === "critical" && (props.req?.server?.errorCount ?? 0) > 0;
  return (
    <div className={`wl-card wl-h-${props.view.health}`}>
      <CardHead {...props} />
      <CardMetrics {...props} />
      <StackBar view={props.view} failed={failed} />
      <CardFoot {...props} />
    </div>
  );
}
