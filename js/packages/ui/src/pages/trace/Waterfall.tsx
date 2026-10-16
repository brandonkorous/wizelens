import { type KeyboardEvent, useMemo, useState } from "react";
import { isErrorSpan, type Span, type SpanCategory, type Trace } from "@wizeworks/lens-core";
import { fmtMs, serviceSlot } from "../../format";
import { Empty } from "../../ui/Panel";

interface Row {
  span: Span;
  depth: number;
  hasChildren: boolean;
}

const CATEGORY_LABEL: Record<SpanCategory, string> = { "http.server": "IN", "http.client": "OUT", db: "SQL", browser: "WEB", internal: "FN" };
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const byStart = (a: Span, b: Span) => a.startMs - b.startMs;

function buildRows(spans: readonly Span[], collapsed: ReadonlySet<string>): Row[] {
  const ids = new Set(spans.map((s) => s.spanId));
  const children = new Map<string, Span[]>();
  const roots: Span[] = [];
  for (const s of spans) {
    if (s.parentSpanId && ids.has(s.parentSpanId)) children.set(s.parentSpanId, [...(children.get(s.parentSpanId) ?? []), s]);
    else roots.push(s);
  }
  const rows: Row[] = [];
  const walk = (s: Span, depth: number) => {
    const kids = (children.get(s.spanId) ?? []).sort(byStart);
    rows.push({ span: s, depth, hasChildren: kids.length > 0 });
    if (!collapsed.has(s.spanId)) for (const k of kids) walk(k, depth + 1);
  };
  for (const r of roots.sort(byStart)) walk(r, 0);
  return rows;
}

function Axis({ total }: { total: number }) {
  return (
    <div className="wl-wf-row wl-wf-axis" aria-hidden="true">
      <div className="wl-wf-label" />
      <div className="wl-wf-track">
        {TICKS.map((t) => (
          <span key={t} className="wl-wf-tick" style={{ left: `${t * 100}%` }}>
            {fmtMs(total * t)}
          </span>
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  row: Row;
  trace: Trace;
  total: number;
  selected: boolean;
  highlighted: boolean;
  collapsed: boolean;
  onSelect: (spanId: string) => void;
  onToggle: (spanId: string) => void;
}

function Label({ row: { span, depth, hasChildren }, trace, collapsed, onToggle }: Pick<RowProps, "row" | "trace" | "collapsed" | "onToggle">) {
  return (
    <div className="wl-wf-label" style={{ paddingLeft: `${8 + depth * 14}px` }} title={span.name}>
      {hasChildren ? (
        <button type="button" className="wl-wf-caret" aria-label={collapsed ? "Expand" : "Collapse"} onClick={(e) => (e.stopPropagation(), onToggle(span.spanId))}>
          {collapsed ? "▸" : "▾"}
        </button>
      ) : (
        <span className="wl-wf-caret-space" />
      )}
      <span className={`wl-cat wl-cat-${span.category.replace(".", "-")}`}>{CATEGORY_LABEL[span.category]}</span>
      <span className="wl-wf-name">{span.name}</span>
      <span className={`wl-svc-dot wl-svc-${serviceSlot(span.service, trace.services)}`} title={span.service} />
    </div>
  );
}

function WaterfallRow(p: RowProps) {
  const { span, hasChildren } = p.row;
  const left = ((span.startMs - p.trace.startMs) / p.total) * 100;
  const width = Math.max(0.4, (span.durationMs / p.total) * 100);
  const cls = ["wl-wf-row", p.selected ? "wl-selected" : "", p.highlighted ? "wl-highlight" : "", isErrorSpan(span) ? "wl-error" : ""].join(" ");
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    p.onSelect(span.spanId);
  };
  return (
    <div className={cls} role="treeitem" aria-selected={p.selected} aria-expanded={hasChildren ? !p.collapsed : undefined} tabIndex={0} onClick={() => p.onSelect(span.spanId)} onKeyDown={onKey}>
      <Label row={p.row} trace={p.trace} collapsed={p.collapsed} onToggle={p.onToggle} />
      <div className="wl-wf-track">
        {TICKS.slice(1, -1).map((t) => (
          <span key={t} className="wl-wf-grid" style={{ left: `${t * 100}%` }} />
        ))}
        <span className={`wl-wf-bar wl-k-${span.category.replace(".", "-")}`} style={{ left: `${left}%`, width: `${width}%` }} />
        <span className="wl-wf-dur" style={left + width > 82 ? { right: `${100 - left + 0.5}%` } : { left: `calc(${left + width}% + 6px)` }}>
          {fmtMs(span.durationMs)}
        </span>
      </div>
    </div>
  );
}

export interface WaterfallProps {
  trace: Trace;
  selected: string | null;
  highlight: ReadonlySet<string>;
  onSelect: (spanId: string) => void;
}

/** Every span of the trace as a collapsible tree on a time axis. */
export function Waterfall({ trace, selected, highlight, onSelect }: WaterfallProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => buildRows(trace.spans, collapsed), [trace.spans, collapsed]);
  const total = Math.max(trace.durationMs, 0.001);
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  if (rows.length === 0) return <Empty>This trace has no spans.</Empty>;
  return (
    <div className="wl-waterfall" role="tree">
      <Axis total={total} />
      {rows.map((row) => (
        <WaterfallRow key={row.span.spanId} row={row} trace={trace} total={total} selected={selected === row.span.spanId} highlighted={highlight.has(row.span.spanId)} collapsed={collapsed.has(row.span.spanId)} onSelect={onSelect} onToggle={toggle} />
      ))}
    </div>
  );
}
