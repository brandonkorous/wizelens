import type { ComponentType, ReactNode } from "react";
import { Box, Cog, Database, ExternalLink, Globe, Inbox, Monitor, Paintbrush, Share2 } from "lucide-react";
import { ATTR_REACT_COMPONENTS, type LayerKind, type Trace, type TraceLayer, traceDurationOf, traceLayers } from "@wizeworks/lens-core/internal";
import { fmtDateTime, fmtMs } from "../../format";
import { hrefTo, traceHref } from "../../routes";
import { Badge, CopyButton, Dot, toneOfStatus } from "../../ui/Badges";
import { niceMax } from "../../ui/chartMath";
import { Empty, Panel } from "../../ui/Panel";
import { traceTone, tracePath } from "./RecentTraces";

const ICONS: Record<LayerKind, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  browser: Monitor,
  network: Globe,
  routing: Share2,
  handler: Cog,
  service: Box,
  queue: Inbox,
  database: Database,
  external: ExternalLink,
  render: Paintbrush,
};

const ticksOf = (max: number) => Array.from({ length: 7 }, (_, i) => (max / 6) * i);

function LayerRow({ layer, max }: { layer: TraceLayer; max: number }) {
  const Icon = ICONS[layer.kind];
  const last = layer.segments[layer.segments.length - 1];
  const labelAt = last ? ((last.startMs + last.durationMs) / max) * 100 : 0;
  return (
    <div className="wl-layer-row">
      <div className="wl-layer-name" title={layer.label}>
        <Icon size={17} aria-hidden={true} />
        <span className="wl-truncate">{layer.label}</span>
      </div>
      <div className="wl-layer-track">
        {layer.segments.map((s, i) => (
          <i key={i} className={`wl-layer-bar wl-layer-${layer.kind}`} style={{ left: `${(s.startMs / max) * 100}%`, width: `max(3px, ${(s.durationMs / max) * 100}%)` }} />
        ))}
        <span className="wl-layer-ms" style={labelAt > 82 ? { right: `${100 - labelAt + 1}%` } : { left: `calc(${labelAt}% + 8px)` }}>
          {fmtMs(layer.totalMs)}
        </span>
      </div>
    </div>
  );
}

function TimelineHead({ trace }: { trace: Trace }) {
  const code = trace.rootStatusCode;
  return (
    <div className="wl-timeline-meta">
      <span className="wl-mono">{`${trace.rootMethod ?? ""} ${tracePath(trace)}`.trim()}</span>
      {code != null && <Badge tone={toneOfStatus(code)}>{code}</Badge>}
      <span className="wl-chip">{fmtMs(traceDurationOf(trace))}</span>
      <span className="wl-chip">{trace.spanCount} {trace.spanCount === 1 ? "span" : "spans"}</span>
      <span className="wl-muted">{fmtDateTime(trace.startMs)}</span>
      <a className="wl-view-all" href={traceHref(trace.traceId)}>
        Open trace <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  );
}

/** Why a trace has no layers: no spans, only React render counts, or no timed work. */
function nothingToDraw(trace: Trace): ReactNode {
  if (trace.spanCount === 0) return "This trace has no spans.";
  if (trace.spans.length > 0 && trace.spans.every((s) => s.attributes[ATTR_REACT_COMPONENTS] != null)) {
    return <>This trace holds React render counts, not timed work. <a href={hrefTo("rendering")}>Rendering</a> lists them under Component Hotspots.</>;
  }
  return "This trace has no timed work to draw here. Open trace shows its spans.";
}

/** One trace as a timeline per layer: browser, network, routing, handler, services, databases, render. */
export function LayerTimeline({ trace }: { trace: Trace | null }) {
  if (!trace) return <Panel title="Trace Timeline"><Empty>Select a trace to see where its time went.</Empty></Panel>;
  const layers = traceLayers(trace);
  const end = Math.max(1, ...layers.flatMap((l) => l.segments.map((s) => s.startMs + s.durationMs)));
  const max = niceMax(end);
  const title = (
    <h2 className="wl-timeline-title">
      Trace Timeline <Dot tone={traceTone(trace)} />
      <span className="wl-mono wl-muted wl-small">{trace.traceId}</span>
      <CopyButton text={trace.traceId} label="Copy trace id" />
    </h2>
  );
  return (
    <Panel title={title}>
      <TimelineHead trace={trace} />
      <div className="wl-layers">
        {layers.length > 0 && (
          <div className="wl-layer-row wl-layer-axis" aria-hidden="true">
            <div />
            <div className="wl-layer-track">
              {ticksOf(max).map((t) => (
                <span key={t} style={{ left: `${(t / max) * 100}%` }}>{fmtMs(t)}</span>
              ))}
            </div>
          </div>
        )}
        {layers.length === 0 ? <Empty>{nothingToDraw(trace)}</Empty> : layers.map((l) => <LayerRow key={l.key} layer={l} max={max} />)}
      </div>
    </Panel>
  );
}
