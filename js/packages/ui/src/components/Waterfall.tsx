import { useMemo, useState } from "react";
import type { Span, SpanCategory, Trace } from "@wizeworks/lens-core";
import { fmtMs, serviceSlot } from "../format";

interface Row {
  span: Span;
  depth: number;
  hasChildren: boolean;
}

const CATEGORY_LABEL: Record<SpanCategory, string> = {
  "http.server": "IN",
  "http.client": "OUT",
  db: "SQL",
  browser: "WEB",
  internal: "FN",
};

function buildRows(spans: readonly Span[], collapsed: ReadonlySet<string>): Row[] {
  const ids = new Set(spans.map((s) => s.spanId));
  const children = new Map<string, Span[]>();
  const roots: Span[] = [];
  for (const s of spans) {
    if (s.parentSpanId && ids.has(s.parentSpanId)) {
      const list = children.get(s.parentSpanId) ?? [];
      list.push(s);
      children.set(s.parentSpanId, list);
    } else roots.push(s);
  }
  const byStart = (a: Span, b: Span) => a.startMs - b.startMs;
  const rows: Row[] = [];
  const walk = (s: Span, depth: number) => {
    const kids = (children.get(s.spanId) ?? []).sort(byStart);
    rows.push({ span: s, depth, hasChildren: kids.length > 0 });
    if (!collapsed.has(s.spanId)) for (const k of kids) walk(k, depth + 1);
  };
  for (const r of roots.sort(byStart)) walk(r, 0);
  return rows;
}

export function Waterfall({
  trace,
  selected,
  highlight,
  onSelect,
}: {
  trace: Trace;
  selected: string | null;
  highlight: ReadonlySet<string>;
  onSelect: (spanId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => buildRows(trace.spans, collapsed), [trace.spans, collapsed]);
  const total = Math.max(trace.durationMs, 0.001);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows.length === 0) return <div className="empty">This trace has no spans.</div>;

  return (
    <div className="waterfall" role="tree">
      <div className="wf-row wf-axis" aria-hidden="true">
        <div className="wf-label" />
        <div className="wf-track">
          {ticks.map((t) => (
            <span key={t} className="wf-tick" style={{ left: `${t * 100}%` }}>
              {fmtMs(total * t)}
            </span>
          ))}
        </div>
      </div>
      {rows.map(({ span, depth, hasChildren }) => {
        const left = ((span.startMs - trace.startMs) / total) * 100;
        const width = Math.max(0.4, (span.durationMs / total) * 100);
        const slot = serviceSlot(span.service, trace.services);
        const isError = span.status === "error" || span.events.some((e) => e.name === "exception");
        const classes = [
          "wf-row",
          selected === span.spanId ? "selected" : "",
          highlight.has(span.spanId) ? "highlight" : "",
          isError ? "error" : "",
        ].join(" ");
        return (
          <div
            key={span.spanId}
            className={classes}
            role="treeitem"
            aria-selected={selected === span.spanId}
            aria-expanded={hasChildren ? !collapsed.has(span.spanId) : undefined}
            tabIndex={0}
            onClick={() => onSelect(span.spanId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(span.spanId);
              }
            }}
          >
            <div className="wf-label" style={{ paddingLeft: `${8 + depth * 14}px` }} title={span.name}>
              {hasChildren ? (
                <button
                  type="button"
                  className="wf-caret"
                  aria-label={collapsed.has(span.spanId) ? "Expand" : "Collapse"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(span.spanId);
                  }}
                >
                  {collapsed.has(span.spanId) ? "▸" : "▾"}
                </button>
              ) : (
                <span className="wf-caret-space" />
              )}
              <span className={`cat cat-${span.category.replace(".", "-")}`}>{CATEGORY_LABEL[span.category]}</span>
              <span className="wf-name">{span.name}</span>
              <span className={`svc-dot svc-${slot}`} title={span.service} />
            </div>
            <div className="wf-track">
              {ticks.slice(1, -1).map((t) => (
                <span key={t} className="wf-grid" style={{ left: `${t * 100}%` }} />
              ))}
              <span className={`wf-bar svc-bg-${slot}`} style={{ left: `${left}%`, width: `${width}%` }} />
              <span className="wf-dur" style={left + width > 82 ? { right: `${100 - left + 0.5}%` } : { left: `calc(${left + width}% + 6px)` }}>
                {fmtMs(span.durationMs)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
