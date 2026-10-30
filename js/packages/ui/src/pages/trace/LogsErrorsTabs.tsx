import { errorInfo, isErrorSpan, releaseOf, type Span, type Trace } from "@wizeworks/lens-core/internal";
import { fmtMs } from "../../format";
import { usePagedRows } from "../../ui/PagedRows";
import { Empty } from "../../ui/Panel";
import { ErrorStack } from "../errors/ResolvedStack";
import { shortCategory } from "../logs/LogParts";
import { ServiceChip } from "./tabParts";
import { pressable } from "../../ui/pressable";
import { StackBox } from "../../ui/StackBox";

interface Props {
  trace: Trace;
  onSelect: (spanId: string) => void;
}

export function LogsTab({ trace, onSelect }: Props) {
  const shown = usePagedRows(trace.logs, { noun: "lines", key: "tracelogs", reset: trace.traceId });
  if (trace.logs.length === 0) return <Empty>No logs were written during this request. Fastify's own "incoming request" and "request completed" lines are not kept: the timeline shows the request.</Empty>;
  return (
    <>
      <div className="wl-table-wrap">
        <table className="wl-table wl-table-cards">
          <thead>
            <tr>
              <th className="wl-num">At</th>
              <th>Level</th>
              <th>Service</th>
              <th>Category</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((l, i) => (
              <tr key={i} className={l.spanId ? "wl-clickable" : undefined} {...(l.spanId ? pressable(() => onSelect(l.spanId!)) : {})}>
                <td className="wl-num wl-muted">+{fmtMs(l.timeMs - trace.startMs)}</td>
                <td data-label="Level">
                  <span className={`wl-lvl wl-lvl-${l.level}`}>{l.level}</span>
                </td>
                <td data-label="Service">
                  <ServiceChip service={l.service} trace={trace} />
                </td>
                <td data-label="Category" className="wl-muted wl-small" title={l.category}>{shortCategory(l.category)}</td>
                <td data-label="Message" className="wl-wrap">{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.pager}
    </>
  );
}

// A browser error's stack opens on its original source (source maps), with the raw stack one click away.
function BrowserStack({ span }: { span: Span }) {
  const e = errorInfo(span);
  return (
    <div onClick={(ev) => ev.stopPropagation()}>
      <ErrorStack event={{ type: e.type ?? "Error", message: e.message, stack: e.stack, browser: true, release: releaseOf(span), traceId: span.traceId, spanId: span.spanId }} />
    </div>
  );
}

export function ErrorsTab({ trace, onSelect }: Props) {
  const spans = new Map(trace.spans.map((s) => [s.spanId, s]));
  const errors = trace.spans.filter(isErrorSpan).map(errorInfo);
  if (errors.length === 0) return <Empty>No errors in this request.</Empty>;
  return (
    <ul className="wl-error-list">
      {errors.map((e) => (
        <li key={e.spanId} className="wl-error-item" {...pressable(() => onSelect(e.spanId))}>
          <div className="wl-error-head">
            <ServiceChip service={e.service} trace={trace} />
            <strong>{e.type ?? "Error"}</strong>
            <span className="wl-muted">in {e.name}</span>
          </div>
          <div className="wl-error-msg">{e.message}</div>
          {e.stack && spans.get(e.spanId)?.category === "browser" ? <BrowserStack span={spans.get(e.spanId)!} /> : e.stack && <StackBox text={e.stack} />}
        </li>
      ))}
    </ul>
  );
}
