import { ExternalLink } from "lucide-react";
import { browserTypeOf, isErrorSpan, type Span, type Trace } from "@wizeworks/lens-core/internal";
import { fmtMs } from "../../format";
import { traceHref } from "../../routes";
import { Empty } from "../../ui/Panel";

const MAX_ROWS = 40;

function depthOf(span: Span, byId: Map<string, Span>): number {
  let depth = 0;
  let parent = span.parentSpanId ? byId.get(span.parentSpanId) : undefined;
  while (parent && depth < 8) {
    depth++;
    parent = parent.parentSpanId ? byId.get(parent.parentSpanId) : undefined;
  }
  return depth;
}

function kindOf(s: Span): string {
  if (isErrorSpan(s)) return "error";
  if (s.category === "browser") return browserTypeOf(s) === "fetch" ? "browser" : "render";
  return s.category.replace(".", "-");
}

function Row({ s, depth, start, total }: { s: Span; depth: number; start: number; total: number }) {
  const left = ((s.startMs - start) / total) * 100;
  const width = Math.max(0.6, (s.durationMs / total) * 100);
  return (
    <div className="wl-rq-span" title={`${s.service} · ${s.name} · ${fmtMs(s.durationMs)}`}>
      <span className="wl-rq-span-name wl-truncate" style={{ paddingLeft: depth * 10 }}>{s.name}</span>
      <span className="wl-rq-span-track">
        <i className={`wl-rq-k-${kindOf(s)}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
      </span>
      <span className="wl-rq-span-ms">{fmtMs(s.durationMs)}</span>
    </div>
  );
}

/** A compact timeline of every span in the request, with a link to the full trace. */
export function PanelTrace({ trace }: { trace: Trace | undefined }) {
  if (!trace) return <Empty title="Trace not loaded">The trace is not in memory. It may have been dropped.</Empty>;
  const byId = new Map(trace.spans.map((s) => [s.spanId, s]));
  const total = Math.max(trace.durationMs, 0.001);
  const shown = trace.spans.slice(0, MAX_ROWS);
  return (
    <>
      <div className="wl-rq-trace-meta wl-muted wl-small">
        {trace.spanCount} spans · {trace.services.join(", ")} · {fmtMs(trace.durationMs)}
      </div>
      <div className="wl-rq-spans">
        {shown.map((s) => (
          <Row key={s.spanId} s={s} depth={depthOf(s, byId)} start={trace.startMs} total={total} />
        ))}
      </div>
      {trace.spans.length > MAX_ROWS && <p className="wl-muted wl-small">Showing {MAX_ROWS} of {trace.spans.length} spans.</p>}
      <a className="wl-btn wl-btn-primary-outline wl-rq-full" href={traceHref(trace.traceId)}>
        <ExternalLink aria-hidden="true" /> View full trace
      </a>
    </>
  );
}
