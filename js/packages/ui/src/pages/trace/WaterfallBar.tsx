import { useMemo, useState } from "react";
import { criticalPath, isErrorSpan, type Span, type Trace } from "@wizeworks/lens-core";
import { SearchInput } from "../../ui/Controls";
import { Check } from "../../ui/Field";

export interface SpanFilter {
  text: string;
  errors: boolean;
  critical: boolean;
}

/** The spans to show: matches and their parents; null when nothing filters. */
function keepOf(trace: Trace, f: SpanFilter): Set<string> | null {
  if (!f.text && !f.errors && !f.critical) return null;
  const q = f.text.trim().toLowerCase();
  const path = f.critical ? criticalPath(trace) : null;
  const hit = (s: Span) => (!q || `${s.name} ${s.service}`.toLowerCase().includes(q)) && (!f.errors || isErrorSpan(s)) && (!path || path.has(s.spanId));
  const byId = new Map(trace.spans.map((s) => [s.spanId, s]));
  const keep = new Set<string>();
  for (const s of trace.spans.filter(hit)) {
    for (let p: Span | undefined = s; p && !keep.has(p.spanId); p = p.parentSpanId ? byId.get(p.parentSpanId) : undefined) keep.add(p.spanId);
  }
  return keep;
}

/** Span search, errors only, the critical path, and expand or collapse all. */
export function useSpanFilter(trace: Trace): { filter: SpanFilter; setFilter: (f: SpanFilter) => void; keep: Set<string> | null } {
  const [filter, setFilter] = useState<SpanFilter>({ text: "", errors: false, critical: false });
  const keep = useMemo(() => keepOf(trace, filter), [trace, filter]);
  return { filter, setFilter, keep };
}

export interface WaterfallBarProps {
  filter: SpanFilter;
  onFilter: (f: SpanFilter) => void;
  shown: number;
  total: number;
  onExpand: (open: boolean) => void;
}

export function WaterfallBar({ filter, onFilter, shown, total, onExpand }: WaterfallBarProps) {
  return (
    <div className="wl-wf-bar-tools">
      <SearchInput value={filter.text} onChange={(text) => onFilter({ ...filter, text })} placeholder="Find spans by name or service…" />
      <Check label="Errors only" checked={filter.errors} onChange={(e) => onFilter({ ...filter, errors: e.target.checked })} />
      <Check label="Critical path" checked={filter.critical} onChange={(e) => onFilter({ ...filter, critical: e.target.checked })} />
      <span className="wl-muted wl-small">{shown === total ? `${total} spans` : `${shown} of ${total} spans`}</span>
      <button type="button" className="wl-link-btn" onClick={() => onExpand(true)}>Expand all</button>
      <button type="button" className="wl-link-btn" onClick={() => onExpand(false)}>Collapse all</button>
    </div>
  );
}
